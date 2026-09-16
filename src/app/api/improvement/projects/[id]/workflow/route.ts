import { NextResponse } from "next/server";
import { arePdsaMilestonesComplete, normalizeProjectMilestone } from "@/lib/improvement-project-setup";
import { improvementProjectRollbackPatch, improvementRecordRollbackPatch } from "@/lib/improvement-workflow-audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const CLOSE_PROJECT_RPC = "qlcl_close_improvement_project_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "projects.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền quản lý đề án." }, { status: 403 });

  const { id: recordId } = await params;
  const body: any = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const { data: record } = await supabase
    .from("records")
    .select("id,lifecycle_status,closed_at,updated_at")
    .eq("id", recordId)
    .eq("record_type", "IMPROVEMENT_PROJECT")
    .maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy đề án hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Đề án không còn hoạt động." }, { status: 409 });

  const admin: any = createAdminClient();
  const { data: project, error } = await admin
    .from("improvement_projects")
    .select("id,workflow_status,problem_statement,start_date,target_end_date,scope_description,approved_at,actual_end_date,updated_at")
    .eq("record_id", recordId)
    .maybeSingle();
  if (error || !project) return NextResponse.json({ error: error?.message || "Không tìm thấy dữ liệu đề án." }, { status: 404 });

  const oldStatus = String(project.workflow_status || "DRAFT");
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const reason = String(body.comment || "").trim() || null;
  const projectRollback = improvementProjectRollbackPatch(project);
  const recordRollback = improvementRecordRollbackPatch(record);
  let newStatus = oldStatus;
  let message = "Đã cập nhật đề án.";
  let transaction: "direct" | "legacy-fallback" = "direct";
  let createdReviewId: string | null = null;
  let createdHistoryId: string | null = null;
  let projectChanged = false;
  let recordChanged = false;
  let auditDetails: Record<string, unknown> = {};

  const [{ count: objectives }, { count: milestones }, { data: links }, { count: evidence }] = await Promise.all([
    admin.from("project_objectives").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    admin.from("project_milestones").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    admin.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "HAS_ACTION"),
    admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId),
  ]);

  if (command === "SUBMIT") {
    if (oldStatus !== "DRAFT") return NextResponse.json({ error: "Chỉ đề án nháp mới được gửi phê duyệt." }, { status: 409 });
    if (!String(project.problem_statement || "").trim() || !String(project.scope_description || "").trim() || !project.start_date || !project.target_end_date) return NextResponse.json({ error: "Thiếu vấn đề, phạm vi hoặc thời gian đề án." }, { status: 409 });
    if (!objectives || !milestones) return NextResponse.json({ error: "Cần ít nhất 01 mục tiêu SMART và 01 milestone/PDSA." }, { status: 409 });
    newStatus = "PENDING_APPROVAL";
    const { error: updateError } = await admin.from("improvement_projects").update({ workflow_status: newStatus, updated_at: now }).eq("id", project.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    projectChanged = true;
    message = "Đã gửi đề án phê duyệt.";
  } else if (command === "APPROVE") {
    if (oldStatus !== "PENDING_APPROVAL") return NextResponse.json({ error: "Đề án chưa ở bước chờ phê duyệt." }, { status: 409 });
    newStatus = "APPROVED";
    const { error: updateError } = await admin.from("improvement_projects").update({ workflow_status: newStatus, approved_at: now, updated_at: now }).eq("id", project.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    projectChanged = true;
    auditDetails = { approved_at: now };
    message = "Đã phê duyệt đề án.";
  } else if (command === "START") {
    if (oldStatus !== "APPROVED") return NextResponse.json({ error: "Đề án chưa được phê duyệt." }, { status: 409 });
    newStatus = "IN_PROGRESS";
    const { error: updateError } = await admin.from("improvement_projects").update({ workflow_status: newStatus, updated_at: now }).eq("id", project.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    projectChanged = true;
    message = "Đã bắt đầu triển khai đề án/PDSA.";
  } else if (command === "EVALUATE") {
    if (oldStatus !== "IN_PROGRESS") return NextResponse.json({ error: "Đề án chưa ở bước triển khai." }, { status: 409 });
    const { data: milestoneRows, error: milestoneError } = await admin.from("project_milestones").select("*").eq("project_id", project.id);
    if (milestoneError) return NextResponse.json({ error: milestoneError.message }, { status: 400 });
    const milestoneStatuses: string[] = (milestoneRows || []).map((row: any, index: number) => normalizeProjectMilestone(row, index).status);
    if (!arePdsaMilestonesComplete(milestoneStatuses)) {
      const incompleteMilestones = milestoneStatuses.filter((status: string) => status !== "COMPLETED").length;
      return NextResponse.json({ error: `Còn ${incompleteMilestones || milestoneStatuses.length || 1} milestone PDSA chưa hoàn thành.` }, { status: 409 });
    }
    const ids = (links || []).map((x: any) => x.target_record_id).filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: "Cần Action/can thiệp trước khi đánh giá." }, { status: 409 });
    const { data: actions } = await admin.from("actions").select("workflow_status").in("record_id", ids);
    const incomplete = (actions || []).filter((x: any) => !["COMPLETED", "CANCELLED", "NOT_APPLICABLE"].includes(String(x.workflow_status))).length;
    if (incomplete) return NextResponse.json({ error: `Còn ${incomplete} Action chưa hoàn thành.` }, { status: 409 });
    if (!evidence) return NextResponse.json({ error: "Cần minh chứng và dữ liệu kết quả trước-sau." }, { status: 409 });
    const summary = String(body.objective_achievement_summary || "").trim();
    const result = String(body.overall_result || "").toUpperCase();
    if (!summary || !["ACHIEVED", "PARTIAL", "NOT_ACHIEVED"].includes(result)) return NextResponse.json({ error: "Cần kết luận mức đạt mục tiêu hợp lệ." }, { status: 400 });
    const { data: review, error: reviewError } = await admin.from("project_closure_reviews").insert({ project_id: project.id, reviewed_at: now, objective_achievement_summary: summary, overall_result: result, sustainability_required: !!body.sustainability_required, scaleout_recommended: !!body.scaleout_recommended, comment: reason }).select("id").single();
    if (reviewError || !review) return NextResponse.json({ error: reviewError?.message || "Không lưu được đánh giá đề án." }, { status: 400 });
    createdReviewId = String(review.id);
    newStatus = result === "ACHIEVED" ? "EVALUATED" : "IN_PROGRESS";
    const { error: updateError } = await admin.from("improvement_projects").update({ workflow_status: newStatus, updated_at: now }).eq("id", project.id);
    if (updateError) {
      await admin.from("project_closure_reviews").delete().eq("id", review.id);
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
    projectChanged = true;
    auditDetails = { overall_result: result, closure_review_id: createdReviewId };
    message = result === "ACHIEVED" ? "Đã xác nhận đề án đạt mục tiêu." : "Kết quả chưa đạt đầy đủ; tiếp tục chu trình PDSA.";
  } else if (command === "CLOSE") {
    if (oldStatus !== "EVALUATED") return NextResponse.json({ error: "Chỉ đề án đã đánh giá đạt mới được đóng." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Kết luận duy trì/nhân rộng là bắt buộc." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(CLOSE_PROJECT_RPC, {
      p_project_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });
    if (!txError) return NextResponse.json({ ok: true, status: "CLOSED", message: "Đã đóng đề án và giữ quyết định duy trì/nhân rộng.", transaction: "atomic", result: tx });
    if (!isMissingRpcFunction(txError, CLOSE_PROJECT_RPC)) {
      const txMessage = rpcErrorMessage(txError, "Không thể đóng đề án cải tiến.");
      return NextResponse.json({ error: txMessage }, { status: /not active|evaluated|achieved|incomplete|required/i.test(txMessage) ? 409 : 400 });
    }

    transaction = "legacy-fallback";
    const ids = (links || []).map((x: any) => x.target_record_id).filter(Boolean);
    const { data: actions } = ids.length ? await admin.from("actions").select("workflow_status").in("record_id", ids) : { data: [] };
    const incomplete = (actions || []).filter((x: any) => !["COMPLETED", "CANCELLED", "NOT_APPLICABLE"].includes(String(x.workflow_status))).length;
    if (incomplete) return NextResponse.json({ error: `Còn ${incomplete} Action chưa hoàn thành.` }, { status: 409 });
    if (!evidence) return NextResponse.json({ error: "Cần minh chứng kết quả trước khi đóng đề án." }, { status: 409 });
    const { data: latestReview } = await admin.from("project_closure_reviews").select("overall_result").eq("project_id", project.id).order("reviewed_at", { ascending: false }).limit(1).maybeSingle();
    if (latestReview?.overall_result !== "ACHIEVED") return NextResponse.json({ error: "Đánh giá đóng gần nhất phải xác nhận ACHIEVED." }, { status: 409 });

    newStatus = "CLOSED";
    const { error: projectError } = await admin.from("improvement_projects").update({ workflow_status: newStatus, actual_end_date: today, updated_at: now }).eq("id", project.id);
    if (projectError) return NextResponse.json({ error: projectError.message }, { status: 400 });
    projectChanged = true;
    const { error: recordError } = await admin.from("records").update({ lifecycle_status: "CLOSED", closed_at: now, updated_at: now }).eq("id", recordId);
    if (recordError) {
      await admin.from("improvement_projects").update(projectRollback).eq("id", project.id);
      return NextResponse.json({ error: recordError.message }, { status: 400 });
    }
    recordChanged = true;
    const { data: history, error: historyError } = await admin.from("record_status_history").insert({ record_id: recordId, old_status: record.lifecycle_status, new_status: "CLOSED", changed_by: auth.user.id, reason }).select("id").single();
    if (historyError || !history) {
      await admin.from("records").update(recordRollback).eq("id", recordId);
      await admin.from("improvement_projects").update(projectRollback).eq("id", project.id);
      return NextResponse.json({ error: historyError?.message || "Không ghi được lịch sử trạng thái đề án." }, { status: 400 });
    }
    createdHistoryId = String(history.id);
    auditDetails = { actual_end_date: today };
    message = "Đã đóng đề án và giữ quyết định duy trì/nhân rộng.";
  } else {
    return NextResponse.json({ error: "Thao tác đề án không hợp lệ." }, { status: 400 });
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    record_id: recordId,
    table_name: "improvement_projects",
    row_id: project.id,
    action_type: `IMPROVEMENT_PROJECT_${command}`,
    old_value: {
      workflow_status: oldStatus,
      approved_at: project.approved_at ?? null,
      actual_end_date: project.actual_end_date ?? null,
    },
    new_value: { workflow_status: newStatus, ...auditDetails },
    reason,
    request_meta: { source: "qlcl-ui", transaction },
  });

  if (auditError) {
    const rollbackErrors: string[] = [];
    if (createdReviewId) {
      const { error: reviewRollbackError } = await admin.from("project_closure_reviews").delete().eq("id", createdReviewId);
      if (reviewRollbackError) rollbackErrors.push(`review: ${reviewRollbackError.message}`);
    }
    if (createdHistoryId) {
      const { error: historyRollbackError } = await admin.from("record_status_history").delete().eq("id", createdHistoryId);
      if (historyRollbackError) rollbackErrors.push(`history: ${historyRollbackError.message}`);
    }
    if (recordChanged) {
      const { error: recordRollbackError } = await admin.from("records").update(recordRollback).eq("id", recordId);
      if (recordRollbackError) rollbackErrors.push(`record: ${recordRollbackError.message}`);
    }
    if (projectChanged) {
      const { error: projectRollbackError } = await admin.from("improvement_projects").update(projectRollback).eq("id", project.id);
      if (projectRollbackError) rollbackErrors.push(`project: ${projectRollbackError.message}`);
    }
    const suffix = rollbackErrors.length ? ` Rollback chưa hoàn tất: ${rollbackErrors.join("; ")}` : " Thay đổi đã được hoàn tác.";
    return NextResponse.json({ error: `Không ghi được audit trail: ${auditError.message}.${suffix}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, status: newStatus, message, transaction });
}
