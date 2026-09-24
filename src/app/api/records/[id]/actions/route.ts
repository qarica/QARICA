import { NextResponse } from "next/server";
import { actionCreatePermissions } from "@/lib/source-action-policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const ALLOWED_PRIORITY = new Set(["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"]);
const CAPA_TYPES = new Set(["CORRECTION", "CORRECTIVE", "PREVENTIVE", "VERIFICATION"]);
const RISK_TYPES = new Set(["AVOID", "REDUCE", "TRANSFER", "ACCEPT", "CONTINGENCY"]);
const CREATE_LINKED_ACTION_RPC = "qlcl_create_linked_action_v2";

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
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim() || null;
  const priority = String(body.priority || "NORMAL").trim().toUpperCase();
  const leadDepartmentId = String(body.lead_department_id || "").trim();
  const assignmentTargetType = String(body.assignment_target_type || (body.assignee_group_id ? "GROUP" : "USER")).trim().toUpperCase();
  const assigneeUserId = String(body.assignee_user_id || "").trim();
  const assigneeGroupId = String(body.assignee_group_id || "").trim();
  const startDate = body.start_date ? String(body.start_date) : null;
  const dueDate = body.due_date ? String(body.due_date) : null;
  const expectedResult = String(body.expected_result || "").trim();
  const verificationRequirement = String(body.verification_requirement || "").trim() || null;
  const capaActionType = String(body.capa_action_type || "CORRECTIVE").toUpperCase();
  const riskTreatmentType = String(body.risk_treatment_type || "REDUCE").toUpperCase();
  const failureModeId = String(body.failure_mode_id || "").trim();
  const rootCauseIds = Array.from(new Set((Array.isArray(body.root_cause_ids) ? body.root_cause_ids : []).map((value: unknown) => String(value || "").trim()).filter(Boolean)));

  if (!title) return NextResponse.json({ error: "Nội dung công việc là bắt buộc." }, { status: 400 });
  if (!leadDepartmentId) return NextResponse.json({ error: "Cần chọn khoa/phòng phụ trách." }, { status: 400 });
  if (!["USER","GROUP"].includes(assignmentTargetType)) return NextResponse.json({ error: "Đối tượng phân công không hợp lệ." }, { status: 400 });
  if (assignmentTargetType === "USER" && !assigneeUserId) return NextResponse.json({ error: "Cần chọn cá nhân phụ trách." }, { status: 400 });
  if (assignmentTargetType === "GROUP" && !assigneeGroupId) return NextResponse.json({ error: "Cần chọn nhóm phụ trách." }, { status: 400 });
  if (!dueDate) return NextResponse.json({ error: "Hạn hoàn thành là bắt buộc." }, { status: 400 });
  if (!expectedResult) return NextResponse.json({ error: "Kết quả mong đợi là bắt buộc." }, { status: 400 });
  if (!ALLOWED_PRIORITY.has(priority)) return NextResponse.json({ error: "Mức ưu tiên không hợp lệ." }, { status: 400 });
  if (startDate && dueDate < startDate) return NextResponse.json({ error: "Hạn hoàn thành không được trước ngày bắt đầu." }, { status: 400 });
  if (source.record_type === "CAPA" && !CAPA_TYPES.has(capaActionType)) return NextResponse.json({ error: "Loại hành động CAPA không hợp lệ." }, { status: 400 });
  if (source.record_type === "RISK" && !RISK_TYPES.has(riskTreatmentType)) return NextResponse.json({ error: "Biện pháp xử lý rủi ro không hợp lệ." }, { status: 400 });
  if (source.record_type === "FMEA" && !failureModeId) return NextResponse.json({ error: "Cần chọn failure mode mà Action này xử lý." }, { status: 400 });
  if (!(["INCIDENT", "CAPA"].includes(source.record_type)) && rootCauseIds.length) return NextResponse.json({ error: "Chỉ Action từ Sự cố/CAPA mới được gắn nguyên nhân gốc RCA." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller, error: callerError }, { data: department }] = await Promise.all([
    admin.from("profiles").select("user_id,organization_id,is_active").eq("user_id", user.id).maybeSingle(),
    admin.from("departments").select("id,organization_id,is_active").eq("id", leadDepartmentId).maybeSingle(),
  ]);
  if (callerError || !caller?.is_active || !caller.organization_id || caller.organization_id !== source.organization_id) return NextResponse.json({ error: callerError?.message || "Tài khoản hoặc phạm vi tổ chức không hợp lệ." }, { status: 403 });
  if (!department?.is_active || department.organization_id !== caller.organization_id) return NextResponse.json({ error: "Khoa/phòng phụ trách không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });

  if (assignmentTargetType === "USER") {
    const { data: assignee } = await admin.from("profiles").select("user_id,organization_id,is_active").eq("user_id", assigneeUserId).maybeSingle();
    if (!assignee?.is_active || assignee.organization_id !== caller.organization_id) return NextResponse.json({ error: "Cá nhân phụ trách không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
  } else {
    const { data: group } = await admin.from("work_groups").select("id,organization_id,is_active").eq("id", assigneeGroupId).maybeSingle();
    if (!group?.is_active || group.organization_id !== caller.organization_id) return NextResponse.json({ error: "Nhóm phụ trách không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
    const { count: activeMembers } = await admin.from("work_group_members").select("id", { count: "exact", head: true }).eq("group_id", assigneeGroupId).eq("is_active", true);
    if (!activeMembers) return NextResponse.json({ error: "Nhóm phụ trách chưa có thành viên hoạt động." }, { status: 400 });
  }

  if (source.record_type === "FMEA") {
    const { data: study } = await admin.from("fmea_studies").select("id").eq("record_id", source.id).maybeSingle();
    if (!study?.id) return NextResponse.json({ error: "Không tìm thấy nghiên cứu FMEA." }, { status: 409 });
    const { data: steps } = await admin.from("fmea_process_steps").select("id").eq("fmea_study_id", study.id);
    const stepIds = (steps ?? []).map((x: any) => x.id);
    const { data: mode } = stepIds.length ? await admin.from("fmea_failure_modes").select("id").eq("id", failureModeId).in("process_step_id", stepIds).maybeSingle() : { data: null } as any;
    if (!mode) return NextResponse.json({ error: "Failure mode không thuộc FMEA nguồn hoặc không còn tồn tại." }, { status: 409 });
  }

  const rpcPayload = {
    title,
    description,
    priority,
    lead_department_id: leadDepartmentId,
    assignment_target_type: assignmentTargetType,
    assignee_user_id: assignmentTargetType === "USER" ? assigneeUserId : null,
    assignee_group_id: assignmentTargetType === "GROUP" ? assigneeGroupId : null,
    start_date: startDate,
    due_date: dueDate,
    expected_result: expectedResult,
    verification_requirement: verificationRequirement,
    capa_action_type: capaActionType,
    risk_treatment_type: riskTreatmentType,
    failure_mode_id: failureModeId || null,
    root_cause_ids: rootCauseIds,
  };
  const { data: tx, error: txError } = await admin.rpc(CREATE_LINKED_ACTION_RPC, { p_source_record_id: source.id, p_actor_user_id: user.id, p_payload: rpcPayload });
  if (!txError) {
    const result = (tx || {}) as Record<string, unknown>;
    return NextResponse.json({ ok: true, action_id: result.action_id, record_id: result.record_id, record_code: result.record_code, transaction: "atomic", result: tx });
  }
  const txMessage = rpcErrorMessage(txError, "Không tạo được Action liên kết.");
  return NextResponse.json(
    { error: txMessage },
    { status: /required|invalid|outside organization|not found|must be active|does not support|failure mode|root cause|rca/i.test(txMessage) ? 409 : 400 },
  );
}
