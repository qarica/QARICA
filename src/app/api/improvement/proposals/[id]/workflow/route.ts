import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const CONVERT_RPC = "qlcl_approve_proposal_create_project_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const body: any = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const [{ data: canManage }, { data: canPropose }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "projects.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "projects.propose" }),
  ]);
  if (command === "SUBMIT" ? !canManage && !canPropose : !canManage) return NextResponse.json({ error: "Bạn chưa có quyền thực hiện bước này." }, { status: 403 });

  const { id: recordId } = await params;
  const { data: record } = await supabase.from("records").select("id,organization_id,record_code,title,work_year,lifecycle_status,owner_department_id,owner_user_id").eq("id", recordId).eq("record_type", "IMPROVEMENT_PROPOSAL").maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy đề xuất hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Đề xuất không còn hoạt động." }, { status: 409 });

  const admin: any = createAdminClient();
  const { data: proposal, error } = await admin.from("improvement_proposals").select("id,problem_description,reason_for_improvement,source_type,existing_data_summary,proposed_scope,workflow_status").eq("record_id", recordId).maybeSingle();
  if (error || !proposal) return NextResponse.json({ error: error?.message || "Không tìm thấy dữ liệu đề xuất." }, { status: 404 });
  const oldStatus = String(proposal.workflow_status || "DRAFT");
  const now = new Date().toISOString();
  let newStatus = oldStatus;
  let reason = String(body.comment || "").trim() || null;
  let message = "Đã cập nhật đề xuất.";
  let projectRecordId: null | string = null;

  if (command === "SUBMIT") {
    if (!["DRAFT", "RETURNED"].includes(oldStatus)) return NextResponse.json({ error: "Chỉ đề xuất nháp hoặc bị trả lại mới được gửi thẩm định." }, { status: 409 });
    if (!String(proposal.problem_description || "").trim() || !String(proposal.existing_data_summary || "").trim() || !String(proposal.proposed_scope || "").trim()) return NextResponse.json({ error: "Cần đủ vấn đề, dữ liệu nền và phạm vi trước khi gửi." }, { status: 409 });
    newStatus = "SUBMITTED";
    const { error: updateError } = await admin.from("improvement_proposals").update({ workflow_status: newStatus, submitted_at: now, updated_at: now }).eq("id", proposal.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    message = "Đã gửi đề xuất để thẩm định.";
  } else if (command === "RETURN") {
    if (oldStatus !== "SUBMITTED") return NextResponse.json({ error: "Đề xuất không ở trạng thái chờ thẩm định." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Lý do trả lại là bắt buộc." }, { status: 400 });
    newStatus = "RETURNED";
    const { error: updateError } = await admin.from("improvement_proposals").update({ workflow_status: newStatus, reviewed_at: now, updated_at: now }).eq("id", proposal.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    message = "Đã trả đề xuất để bổ sung.";
  } else if (command === "REJECT") {
    if (oldStatus !== "SUBMITTED") return NextResponse.json({ error: "Đề xuất không ở trạng thái chờ thẩm định." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Lý do không phê duyệt là bắt buộc." }, { status: 400 });
    newStatus = "REJECTED";
    const { error: updateError } = await admin.from("improvement_proposals").update({ workflow_status: newStatus, reviewed_at: now, updated_at: now }).eq("id", proposal.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    message = "Đã kết thúc đề xuất ở trạng thái không phê duyệt.";
  } else if (command === "APPROVE_AND_CREATE_PROJECT") {
    if (oldStatus !== "SUBMITTED") return NextResponse.json({ error: "Đề xuất chưa ở bước thẩm định." }, { status: 409 });
    const startDate = String(body.start_date || "").trim();
    const targetEnd = String(body.target_end_date || "").trim();
    if (!startDate || !targetEnd || targetEnd < startDate) return NextResponse.json({ error: "Cần ngày bắt đầu và hạn mục tiêu hợp lệ." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(CONVERT_RPC, {
      p_proposal_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_start_date: startDate,
      p_target_end_date: targetEnd,
      p_reason: reason,
    });
    if (!txError) {
      const id = typeof tx === "object" && tx && "project_record_id" in tx ? String((tx as Record<string, unknown>).project_record_id || "") : null;
      return NextResponse.json({ ok: true, status: "APPROVED", message: "Đã phê duyệt và tạo đề án cải tiến.", project_record_id: id, transaction: "atomic", result: tx });
    }
    if (!isMissingRpcFunction(txError, CONVERT_RPC)) {
      const txMessage = rpcErrorMessage(txError, "Không thể chuyển đề xuất thành đề án.");
      return NextResponse.json({ error: txMessage }, { status: /already|not active|must be submitted|required|valid project/i.test(txMessage) ? 409 : 400 });
    }

    const { data: existing } = await admin.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "CONVERTED_TO_PROJECT").maybeSingle();
    if (existing) return NextResponse.json({ error: "Đề xuất đã được chuyển thành đề án; không tạo trùng." }, { status: 409 });
    const { data: code, error: codeError } = await admin.rpc("next_record_code", { p_record_type: "IMPROVEMENT_PROJECT", p_work_year: record.work_year });
    if (codeError || !code) return NextResponse.json({ error: codeError?.message || "Không cấp được mã đề án." }, { status: 400 });
    const { data: projectRecord, error: recordError } = await admin.from("records").insert({ organization_id: record.organization_id, record_type: "IMPROVEMENT_PROJECT", record_code: code, title: record.title, work_year: record.work_year, owner_department_id: record.owner_department_id, owner_user_id: record.owner_user_id, lifecycle_status: "ACTIVE", created_by: auth.user.id }).select("id").single();
    if (recordError || !projectRecord) return NextResponse.json({ error: recordError?.message || "Không tạo được hồ sơ đề án." }, { status: 400 });
    const { data: project, error: projectError } = await admin.from("improvement_projects").insert({ record_id: projectRecord.id, work_year: record.work_year, title: record.title, problem_statement: proposal.problem_description, lead_department_id: record.owner_department_id, project_leader_user_id: record.owner_user_id, start_date: startDate, target_end_date: targetEnd, scope_description: proposal.proposed_scope, workflow_status: "DRAFT" }).select("id").single();
    if (projectError || !project) {
      await admin.from("records").update({ lifecycle_status: "ARCHIVED", updated_at: now }).eq("id", projectRecord.id);
      return NextResponse.json({ error: projectError?.message || "Không tạo được dữ liệu đề án." }, { status: 400 });
    }
    const { error: linkError } = await admin.from("record_links").insert({ source_record_id: recordId, target_record_id: projectRecord.id, relation_type: "CONVERTED_TO_PROJECT", metadata: { source_record_code: record.record_code, approved_from_proposal: true }, created_by: auth.user.id });
    if (linkError) {
      await admin.from("improvement_projects").delete().eq("id", project.id);
      await admin.from("records").update({ lifecycle_status: "ARCHIVED", updated_at: now }).eq("id", projectRecord.id);
      return NextResponse.json({ error: linkError.message }, { status: 400 });
    }
    newStatus = "APPROVED";
    projectRecordId = projectRecord.id;
    const { error: proposalError } = await admin.from("improvement_proposals").update({ workflow_status: newStatus, reviewed_at: now, updated_at: now }).eq("id", proposal.id);
    if (proposalError) {
      await admin.from("record_links").delete().eq("source_record_id", recordId).eq("target_record_id", projectRecord.id).eq("relation_type", "CONVERTED_TO_PROJECT");
      await admin.from("improvement_projects").delete().eq("id", project.id);
      await admin.from("records").update({ lifecycle_status: "ARCHIVED", updated_at: now }).eq("id", projectRecord.id);
      return NextResponse.json({ error: proposalError.message }, { status: 400 });
    }
    reason = reason || "Đề xuất đủ căn cứ và được chuyển thành đề án cải tiến.";
    message = "Đã phê duyệt và tạo đề án cải tiến.";
  } else return NextResponse.json({ error: "Thao tác đề xuất không hợp lệ." }, { status: 400 });

  await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "improvement_proposals", row_id: proposal.id, action_type: `IMPROVEMENT_PROPOSAL_${command}`, old_value: { workflow_status: oldStatus }, new_value: { workflow_status: newStatus, project_record_id: projectRecordId }, reason, request_meta: { source: "qlcl-ui", transaction: command === "APPROVE_AND_CREATE_PROJECT" ? "legacy-fallback" : undefined } });
  return NextResponse.json({ ok: true, status: newStatus, message, project_record_id: projectRecordId, transaction: command === "APPROVE_AND_CREATE_PROJECT" ? "legacy-fallback" : "direct" });
}
