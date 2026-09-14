import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const ALLOWED_ACTIONS = new Set(["SUBMIT", "APPROVE", "RETURN", "START", "HOLD", "RESUME", "COMPLETE"]);
const APPROVE_PLAN_BUNDLE_RPC = "qlcl_approve_plan_bundle_v2";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("plans.manage");
  if (!auth.ok) return auth.response;

  const { id: programId } = await params;
  const body = await request.json().catch(() => ({}));
  const requestedAction = String(body.action || "").trim().toUpperCase();
  const note = body.note ? String(body.note).trim() : "";
  if (!ALLOWED_ACTIONS.has(requestedAction)) return NextResponse.json({ error: "Thao tác vòng đời kế hoạch không hợp lệ." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller, error: callerError }, { data: program, error: programError }] = await Promise.all([
    admin.from("profiles").select("user_id,organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("work_programs").select("id,record_id,owner_user_id,workflow_status,approved_by,approved_at,general_objective,specific_objectives,requirements,draft_actions,revision_no").eq("id", programId).maybeSingle(),
  ]);

  if (callerError || !caller?.organization_id || !caller.is_active) return NextResponse.json({ error: callerError?.message || "Tài khoản không hợp lệ hoặc chưa gắn bệnh viện." }, { status: 403 });
  if (programError || !program) return NextResponse.json({ error: programError?.message || "Không tìm thấy kế hoạch." }, { status: 404 });

  const { data: record, error: recordError } = await admin.from("records").select("id,organization_id,lifecycle_status,title").eq("id", program.record_id).maybeSingle();
  if (recordError || !record || record.organization_id !== caller.organization_id || record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Kế hoạch không thuộc phạm vi bệnh viện hiện tại hoặc đã ngưng hoạt động." }, { status: 403 });

  async function updateStatus(from: string, to: string, extra: Record<string, unknown> = {}) {
    if (program.workflow_status !== from) return NextResponse.json({ error: "Trạng thái hiện tại không phù hợp với thao tác này. Vui lòng tải lại trang." }, { status: 409 });
    const { error } = await admin.from("work_programs").update({ workflow_status: to, ...extra }).eq("id", program.id).eq("workflow_status", from);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, workflow_status: to });
  }

  if (requestedAction === "SUBMIT") {
    const specific = Array.isArray(program.specific_objectives) ? program.specific_objectives.filter((x: unknown) => String(x || "").trim()) : [];
    const tasks = Array.isArray(program.draft_actions) ? program.draft_actions : [];
    if (!String(program.general_objective || "").trim()) return NextResponse.json({ error: "Cần hoàn thiện Mục tiêu chung trước khi gửi duyệt." }, { status: 409 });
    if (!specific.length) return NextResponse.json({ error: "Cần có ít nhất 01 Mục tiêu cụ thể trước khi gửi duyệt." }, { status: 409 });
    if (!String(program.requirements || "").trim()) return NextResponse.json({ error: "Cần hoàn thiện phần Yêu cầu trước khi gửi duyệt." }, { status: 409 });
    if (!tasks.length) return NextResponse.json({ error: "Kế hoạch cần có ít nhất 01 nhiệm vụ/Action trước khi gửi duyệt." }, { status: 409 });
    return updateStatus("DRAFT", "PENDING_APPROVAL", { submitted_at: new Date().toISOString(), returned_reason: null });
  }

  if (requestedAction === "RETURN") {
    if (note.length < 5) return NextResponse.json({ error: "Vui lòng ghi rõ nội dung cần chỉnh sửa." }, { status: 400 });
    if (program.workflow_status !== "PENDING_APPROVAL") return NextResponse.json({ error: "Chỉ kế hoạch đang chờ phê duyệt mới được trả lại chỉnh sửa." }, { status: 409 });
    const { error } = await admin.from("work_programs").update({ workflow_status: "DRAFT", approved_by: null, approved_at: null, returned_reason: note, returned_at: new Date().toISOString(), revision_no: Number(program.revision_no || 1) + 1 }).eq("id", program.id).eq("workflow_status", "PENDING_APPROVAL");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (program.owner_user_id) await admin.from("notifications").insert({ recipient_user_id: program.owner_user_id, notification_type: "PLAN_RETURNED", priority: "HIGH", title: "Kế hoạch cần chỉnh sửa", message: `${record.title}: ${note}`, target_record_id: record.id, target_route: `/plans/${program.id}`, notification_event_key: `plan-returned:${program.id}:${Date.now()}` });
    await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: record.id, table_name: "work_programs", row_id: program.id, action_type: "RETURN_PLAN_FOR_REVISION", new_value: { note, revision_no: Number(program.revision_no || 1) + 1 }, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, workflow_status: "DRAFT" });
  }

  if (requestedAction === "APPROVE") {
    if (program.workflow_status !== "PENDING_APPROVAL") return NextResponse.json({ error: "Chỉ kế hoạch đang chờ phê duyệt mới được phê duyệt." }, { status: 409 });
    const { data: tx, error: txError } = await admin.rpc(APPROVE_PLAN_BUNDLE_RPC, { p_program_id: programId, p_actor_user_id: auth.user.id });
    if (txError) {
      if (isMissingRpcFunction(txError, APPROVE_PLAN_BUNDLE_RPC)) return NextResponse.json({ error: "Plan Composer V2 chưa được kích hoạt trên cơ sở dữ liệu. Không phê duyệt để tránh tạo Action không đầy đủ." }, { status: 503 });
      return NextResponse.json({ error: rpcErrorMessage(txError, "Không thể phê duyệt trọn bộ kế hoạch.") }, { status: 400 });
    }
    if (program.owner_user_id && program.owner_user_id !== auth.user.id) await admin.from("notifications").insert({ recipient_user_id: program.owner_user_id, notification_type: "PLAN_APPROVED", priority: "NORMAL", title: "Kế hoạch đã được phê duyệt", message: record.title, target_record_id: record.id, target_route: `/plans/${program.id}`, notification_event_key: `plan-approved:${program.id}:${Date.now()}` });
    return NextResponse.json({ ok: true, workflow_status: "APPROVED", transaction: "atomic", result: tx });
  }

  if (requestedAction === "START") return updateStatus("APPROVED", "IN_PROGRESS");
  if (requestedAction === "HOLD") return updateStatus("IN_PROGRESS", "ON_HOLD");
  if (requestedAction === "RESUME") return updateStatus("ON_HOLD", "IN_PROGRESS");

  if (requestedAction === "COMPLETE") {
    if (program.workflow_status !== "IN_PROGRESS") return NextResponse.json({ error: "Chỉ kế hoạch đang triển khai mới được xác nhận hoàn thành." }, { status: 409 });
    const { data: progress, error: progressError } = await admin.from("vw_program_progress").select("required_actions,completed_actions,progress_pct").eq("program_id", program.id).maybeSingle();
    if (progressError) return NextResponse.json({ error: progressError.message }, { status: 400 });
    const required = Number(progress?.required_actions ?? 0), completed = Number(progress?.completed_actions ?? 0);
    if (required < 1) return NextResponse.json({ error: "Kế hoạch cần có ít nhất 01 nhiệm vụ bắt buộc trước khi hoàn thành." }, { status: 409 });
    if (completed < required) return NextResponse.json({ error: `Chưa thể hoàn thành kế hoạch: mới hoàn thành ${completed}/${required} nhiệm vụ bắt buộc.` }, { status: 409 });
    return updateStatus("IN_PROGRESS", "COMPLETED");
  }

  return NextResponse.json({ error: "Thao tác không được hỗ trợ." }, { status: 400 });
}
