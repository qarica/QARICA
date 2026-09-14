import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const ALLOWED_PRIORITY = new Set(["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"]);
const CREATE_PLAN_ACTION_RPC = "qlcl_create_plan_action_v1";

function hcmDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("plans.manage");
  if (!auth.ok) return auth.response;

  const { id: programId } = await params;
  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  const description = body.description ? String(body.description).trim() : null;
  const priority = String(body.priority || "NORMAL").trim().toUpperCase();
  const leadDepartmentId = String(body.lead_department_id || "").trim();
  const assigneeUserId = String(body.assignee_user_id || "").trim();
  const dueDate = body.due_date ? String(body.due_date) : null;
  const expectedResult = String(body.expected_result || "").trim();
  const verificationRequirement = body.verification_requirement ? String(body.verification_requirement).trim() : null;
  const milestoneGroup = body.milestone_group ? String(body.milestone_group).trim() : null;
  const isRequired = body.is_required !== false;

  if (!title) return NextResponse.json({ error: "Nội dung nhiệm vụ là bắt buộc." }, { status: 400 });
  if (!leadDepartmentId) return NextResponse.json({ error: "Cần chọn khoa/phòng phụ trách." }, { status: 400 });
  if (!assigneeUserId) return NextResponse.json({ error: "Cần chọn người phụ trách." }, { status: 400 });
  if (!dueDate) return NextResponse.json({ error: "Hạn hoàn thành là bắt buộc." }, { status: 400 });
  if (!expectedResult) return NextResponse.json({ error: "Kết quả mong đợi là bắt buộc." }, { status: 400 });
  if (!ALLOWED_PRIORITY.has(priority)) return NextResponse.json({ error: "Mức ưu tiên không hợp lệ." }, { status: 400 });

  // RLS visibility must be proven before any service-role/admin mutation.
  const { data: visibleProgram, error: visibleError } = await auth.supabase
    .from("work_programs")
    .select("id,record_id,end_date,workflow_status,approved_at")
    .eq("id", programId)
    .maybeSingle();
  if (visibleError || !visibleProgram) return NextResponse.json({ error: visibleError?.message || "Không tìm thấy kế hoạch hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (visibleProgram.workflow_status !== "IN_PROGRESS") return NextResponse.json({ error: "Chỉ được giao nhiệm vụ khi kế hoạch đã được phê duyệt và đang ở trạng thái Đang triển khai." }, { status: 409 });
  if (!visibleProgram.approved_at) return NextResponse.json({ error: "Kế hoạch chưa có thời điểm phê duyệt hợp lệ." }, { status: 409 });

  // Locked business rule: every Action created from a Plan starts on the Plan approval date.
  const startDate = hcmDate(visibleProgram.approved_at);
  if (dueDate < startDate) {
    // Preserve historical deadlines already written in the approved plan. The Action may become overdue immediately.
    // Do not reject or silently move the original deadline forward.
  }

  const { data: visibleRecord } = await auth.supabase.from("records").select("id,organization_id,work_year,lifecycle_status,record_code").eq("id", visibleProgram.record_id).maybeSingle();
  if (!visibleRecord || visibleRecord.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Kế hoạch không còn hoạt động hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const admin = createAdminClient();
  const [{ data: caller, error: callerError }, { data: department }, { data: assignee }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("departments").select("id,organization_id,is_active").eq("id", leadDepartmentId).maybeSingle(),
    admin.from("profiles").select("user_id,organization_id,is_active").eq("user_id", assigneeUserId).maybeSingle(),
  ]);
  if (callerError || !caller?.organization_id || !caller.is_active || caller.organization_id !== visibleRecord.organization_id) return NextResponse.json({ error: callerError?.message || "Tài khoản hoặc phạm vi bệnh viện không hợp lệ." }, { status: 403 });
  if (!department?.is_active || department.organization_id !== caller.organization_id) return NextResponse.json({ error: "Khoa/phòng phụ trách không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
  if (!assignee?.is_active || assignee.organization_id !== caller.organization_id) return NextResponse.json({ error: "Người phụ trách không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });

  const rpcPayload = {
    title,
    description,
    priority,
    lead_department_id: leadDepartmentId,
    assignee_user_id: assigneeUserId,
    start_date: startDate,
    due_date: dueDate,
    expected_result: expectedResult,
    verification_requirement: verificationRequirement,
    milestone_group: milestoneGroup,
    is_required: isRequired,
  };
  const { data: tx, error: txError } = await admin.rpc(CREATE_PLAN_ACTION_RPC, {
    p_program_id: programId,
    p_actor_user_id: auth.user.id,
    p_payload: rpcPayload,
  });
  if (!txError) {
    const result = (tx || {}) as Record<string, unknown>;
    return NextResponse.json({ ok: true, action_id: result.action_id, record_id: result.record_id, record_code: result.record_code, start_date: startDate, transaction: "atomic", result: tx });
  }
  if (!isMissingRpcFunction(txError, CREATE_PLAN_ACTION_RPC)) {
    const txMessage = rpcErrorMessage(txError, "Không tạo được nhiệm vụ kế hoạch.");
    return NextResponse.json({ error: txMessage }, { status: /required|invalid|outside organization|not found|must be in_progress|must be active/i.test(txMessage) ? 409 : 400 });
  }

  // Backward-compatible fallback before the migration exists.
  const { data: recordCode, error: codeError } = await admin.rpc("next_record_code", { p_record_type: "ACTION", p_work_year: visibleRecord.work_year });
  if (codeError || !recordCode) return NextResponse.json({ error: codeError?.message || "Không tạo được mã nhiệm vụ." }, { status: 400 });

  const { data: record, error: recordError } = await admin.from("records").insert({
    organization_id: caller.organization_id,
    record_type: "ACTION",
    record_code: recordCode,
    title,
    work_year: visibleRecord.work_year,
    owner_department_id: leadDepartmentId,
    owner_user_id: assigneeUserId,
    lifecycle_status: "ACTIVE",
    created_by: auth.user.id,
  }).select("id,record_code").single();
  if (recordError || !record) return NextResponse.json({ error: recordError?.message || "Không tạo được hồ sơ nhiệm vụ." }, { status: 400 });

  const { data: action, error: actionError } = await admin.from("actions").insert({
    record_id: record.id,
    description,
    priority,
    lead_department_id: leadDepartmentId,
    assignee_user_id: assigneeUserId,
    start_date: startDate,
    due_date: dueDate,
    expected_result: expectedResult,
    verification_requirement: verificationRequirement,
    workflow_status: "NOT_STARTED",
  }).select("id").single();
  if (actionError || !action) {
    await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id);
    return NextResponse.json({ error: actionError?.message || "Không tạo được nội dung nhiệm vụ." }, { status: 400 });
  }

  const { error: programLinkError } = await admin.from("program_action_links").insert({
    program_id: programId,
    action_id: action.id,
    relation_type: "DELIVERS",
    milestone_group: milestoneGroup,
    is_required: isRequired,
  });
  if (programLinkError) {
    await admin.from("actions").update({ workflow_status: "CANCELLED" }).eq("id", action.id);
    await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id);
    return NextResponse.json({ error: programLinkError.message }, { status: 400 });
  }

  const { error: canonicalError } = await admin.from("record_links").insert({
    source_record_id: visibleRecord.id,
    target_record_id: record.id,
    relation_type: "HAS_ACTION",
    metadata: { source_record_type: "PROGRAM", source_record_code: visibleRecord.record_code, program_id: programId },
    created_by: auth.user.id,
  });
  if (canonicalError) {
    await admin.from("program_action_links").delete().eq("program_id", programId).eq("action_id", action.id);
    await admin.from("actions").update({ workflow_status: "CANCELLED" }).eq("id", action.id);
    await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id);
    return NextResponse.json({ error: `Không tạo được liên kết truy vết Kế hoạch → Action: ${canonicalError.message}` }, { status: 400 });
  }

  await admin.from("notifications").upsert({
    recipient_user_id: assigneeUserId,
    notification_type: "ACTION_ASSIGNED",
    priority,
    title: "Bạn được giao công việc mới",
    message: title,
    target_record_id: record.id,
    target_route: `/tasks/${record.id}`,
    notification_event_key: `action-assigned:${action.id}:${assigneeUserId}`,
    is_read: false,
  }, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true });
  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    record_id: visibleRecord.id,
    table_name: "program_action_links",
    row_id: action.id,
    action_type: "CREATE_PLAN_ACTION",
    new_value: { program_id: programId, action_record_id: record.id, action_id: action.id, title, start_date: startDate, due_date: dueDate, is_required: isRequired },
    request_meta: { source: "qlcl-ui", transaction: "legacy-fallback" },
  });

  return NextResponse.json({ ok: true, action_id: action.id, record_id: record.id, record_code: record.record_code, start_date: startDate, transaction: "legacy-fallback" });
}
