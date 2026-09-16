import { NextResponse } from "next/server";
import { actionCreatePermissions } from "@/lib/source-action-policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const ALLOWED_PRIORITY = new Set(["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"]);
const CAPA_TYPES = new Set(["CORRECTION", "CORRECTIVE", "PREVENTIVE", "VERIFICATION"]);
const RISK_TYPES = new Set(["AVOID", "REDUCE", "TRANSFER", "ACCEPT", "CONTINGENCY"]);
const CREATE_LINKED_ACTION_RPC = "qlcl_create_linked_action_v1";

async function addSpecializedLink(admin: ReturnType<typeof createAdminClient>, source: any, actionId: string, body: any) {
  if (source.record_type === "DIRECTIVE") {
    const { data: root } = await admin.from("external_directives").select("id").eq("record_id", source.id).maybeSingle();
    if (root?.id) return admin.from("directive_action_links").insert({ directive_id: root.id, action_id: actionId, relation_type: "REQUIRES" });
  }
  if (source.record_type === "FINDING") {
    const { data: root } = await admin.from("findings").select("id").eq("record_id", source.id).maybeSingle();
    if (root?.id) return admin.from("finding_action_links").insert({ finding_id: root.id, action_id: actionId, action_role: "CORRECTIVE" });
  }
  if (source.record_type === "CAPA") {
    const actionType = String(body.capa_action_type || "CORRECTIVE");
    if (!CAPA_TYPES.has(actionType)) return { error: { message: "Loại hành động CAPA không hợp lệ." } } as any;
    const { data: root } = await admin.from("capas").select("id").eq("record_id", source.id).maybeSingle();
    if (root?.id) return admin.from("capa_action_links").insert({ capa_id: root.id, action_id: actionId, action_type: actionType });
  }
  if (source.record_type === "RISK") {
    const treatmentType = String(body.risk_treatment_type || "REDUCE");
    if (!RISK_TYPES.has(treatmentType)) return { error: { message: "Biện pháp xử lý rủi ro không hợp lệ." } } as any;
    const { data: root } = await admin.from("risks").select("id").eq("record_id", source.id).maybeSingle();
    if (root?.id) return admin.from("risk_action_links").insert({ risk_id: root.id, action_id: actionId, treatment_type: treatmentType });
  }
  if (source.record_type === "INSPECTION") {
    const { data: root } = await admin.from("inspection_events").select("id,visit_date").eq("record_id", source.id).maybeSingle();
    if (root?.id) return admin.from("inspection_action_links").insert({ inspection_event_id: root.id, action_id: actionId, offset_days: null });
  }
  return { error: null } as any;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { id: sourceRecordId } = await params;
  const { data: source, error: sourceError } = await supabase.from("records").select("id,organization_id,record_type,record_code,title,work_year,lifecycle_status").eq("id", sourceRecordId).maybeSingle();
  if (sourceError || !source) return NextResponse.json({ error: sourceError?.message || "Không tìm thấy hồ sơ hoặc bạn không có quyền truy cập." }, { status: 404 });
  if (source.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Chỉ được giao việc từ hồ sơ đang hoạt động." }, { status: 409 });

  const permissions = actionCreatePermissions(source.record_type);
  if (!permissions.length) return NextResponse.json({ error: "Loại hồ sơ này không dùng chức năng giao Action chung." }, { status: 403 });
  const permissionResults = await Promise.all(permissions.map((permission) => supabase.rpc("has_permission", { p_permission_code: permission })));
  if (!permissionResults.some((result) => result.data === true)) return NextResponse.json({ error: "Bạn chưa có quyền giao Action từ hồ sơ này." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim(); const description = String(body.description || "").trim() || null; const priority = String(body.priority || "NORMAL").trim().toUpperCase();
  const leadDepartmentId = String(body.lead_department_id || "").trim(); const assigneeUserId = String(body.assignee_user_id || "").trim();
  const startDate = body.start_date ? String(body.start_date) : null; const dueDate = body.due_date ? String(body.due_date) : null;
  const expectedResult = String(body.expected_result || "").trim(); const verificationRequirement = String(body.verification_requirement || "").trim() || null;
  const capaActionType = String(body.capa_action_type || "CORRECTIVE").toUpperCase();
  const riskTreatmentType = String(body.risk_treatment_type || "REDUCE").toUpperCase();
  if (!title) return NextResponse.json({ error: "Nội dung công việc là bắt buộc." }, { status: 400 });
  if (!leadDepartmentId) return NextResponse.json({ error: "Cần chọn khoa/phòng phụ trách." }, { status: 400 });
  if (!assigneeUserId) return NextResponse.json({ error: "Cần chọn người phụ trách." }, { status: 400 });
  if (!dueDate) return NextResponse.json({ error: "Hạn hoàn thành là bắt buộc." }, { status: 400 });
  if (!expectedResult) return NextResponse.json({ error: "Kết quả mong đợi là bắt buộc." }, { status: 400 });
  if (!ALLOWED_PRIORITY.has(priority)) return NextResponse.json({ error: "Mức ưu tiên không hợp lệ." }, { status: 400 });
  if (startDate && dueDate < startDate) return NextResponse.json({ error: "Hạn hoàn thành không được trước ngày bắt đầu." }, { status: 400 });
  if (source.record_type === "CAPA" && !CAPA_TYPES.has(capaActionType)) return NextResponse.json({ error: "Loại hành động CAPA không hợp lệ." }, { status: 400 });
  if (source.record_type === "RISK" && !RISK_TYPES.has(riskTreatmentType)) return NextResponse.json({ error: "Biện pháp xử lý rủi ro không hợp lệ." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller, error: callerError }, { data: department }, { data: assignee }] = await Promise.all([
    admin.from("profiles").select("user_id,organization_id,is_active").eq("user_id", user.id).maybeSingle(),
    admin.from("departments").select("id,organization_id,is_active").eq("id", leadDepartmentId).maybeSingle(),
    admin.from("profiles").select("user_id,organization_id,is_active").eq("user_id", assigneeUserId).maybeSingle(),
  ]);
  if (callerError || !caller?.is_active || !caller.organization_id || caller.organization_id !== source.organization_id) return NextResponse.json({ error: callerError?.message || "Tài khoản hoặc phạm vi bệnh viện không hợp lệ." }, { status: 403 });
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
    capa_action_type: capaActionType,
    risk_treatment_type: riskTreatmentType,
  };
  const { data: tx, error: txError } = await admin.rpc(CREATE_LINKED_ACTION_RPC, {
    p_source_record_id: source.id,
    p_actor_user_id: user.id,
    p_payload: rpcPayload,
  });
  if (!txError) {
    const result = (tx || {}) as Record<string, unknown>;
    return NextResponse.json({ ok: true, action_id: result.action_id, record_id: result.record_id, record_code: result.record_code, transaction: "atomic", result: tx });
  }
  if (!isMissingRpcFunction(txError, CREATE_LINKED_ACTION_RPC)) {
    const txMessage = rpcErrorMessage(txError, "Không tạo được Action liên kết.");
    return NextResponse.json({ error: txMessage }, { status: /required|invalid|outside organization|not found|must be active|does not support/i.test(txMessage) ? 409 : 400 });
  }

  // Backward-compatible fallback before the transaction migration exists.
  const { data: recordCode, error: codeError } = await admin.rpc("next_record_code", { p_org: caller.organization_id, p_record_type: "ACTION", p_work_year: source.work_year });
  if (codeError || !recordCode) return NextResponse.json({ error: codeError?.message || "Không tạo được mã Action." }, { status: 400 });
  const { data: record, error: recordError } = await admin.from("records").insert({ organization_id: caller.organization_id, record_type: "ACTION", record_code: recordCode, title, work_year: source.work_year, owner_department_id: leadDepartmentId, owner_user_id: assigneeUserId, lifecycle_status: "ACTIVE", created_by: user.id }).select("id,record_code").single();
  if (recordError || !record) return NextResponse.json({ error: recordError?.message || "Không tạo được hồ sơ Action." }, { status: 400 });
  const { data: action, error: actionError } = await admin.from("actions").insert({ record_id: record.id, description, priority, lead_department_id: leadDepartmentId, assignee_user_id: assigneeUserId, start_date: startDate, due_date: dueDate, expected_result: expectedResult, verification_requirement: verificationRequirement, workflow_status: "NOT_STARTED" }).select("id").single();
  if (actionError || !action) { await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id); return NextResponse.json({ error: actionError?.message || "Không tạo được nội dung Action." }, { status: 400 }); }

  const { error: linkError } = await admin.from("record_links").insert({ source_record_id: source.id, target_record_id: record.id, relation_type: "HAS_ACTION", metadata: { source_record_type: source.record_type, source_record_code: source.record_code }, created_by: user.id });
  if (linkError) { await admin.from("actions").update({ workflow_status: "CANCELLED" }).eq("id", action.id); await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id); return NextResponse.json({ error: `Không liên kết được Action với hồ sơ nguồn: ${linkError.message}` }, { status: 400 }); }

  const specialized = await addSpecializedLink(admin, source, action.id, { ...body, capa_action_type: capaActionType, risk_treatment_type: riskTreatmentType });
  if (specialized?.error) {
    await admin.from("record_links").delete().eq("source_record_id", source.id).eq("target_record_id", record.id).eq("relation_type", "HAS_ACTION");
    await admin.from("actions").update({ workflow_status: "CANCELLED" }).eq("id", action.id);
    await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id);
    return NextResponse.json({ error: `Không liên kết được Action với workflow chuyên biệt: ${specialized.error.message}` }, { status: 400 });
  }

  await admin.from("notifications").upsert({ recipient_user_id: assigneeUserId, notification_type: "ACTION_ASSIGNED", priority, title: "Bạn được giao công việc mới", message: `${title} · nguồn ${source.record_code}`, target_record_id: record.id, target_route: `/tasks/${record.id}`, notification_event_key: `record-action:${source.id}:${action.id}:${assigneeUserId}`, is_read: false }, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true });
  await admin.from("audit_logs").insert({ actor_user_id: user.id, record_id: source.id, table_name: "record_links", row_id: record.id, action_type: "CREATE_LINKED_ACTION", new_value: { action_record_id: record.id, action_id: action.id, title, due_date: dueDate, assignee_user_id: assigneeUserId }, request_meta: { source: "qlcl-ui", source_record_type: source.record_type, transaction: "legacy-fallback" } });
  return NextResponse.json({ ok: true, action_id: action.id, record_id: record.id, record_code: record.record_code, transaction: "legacy-fallback" });
}
