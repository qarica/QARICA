import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const ALLOWED_PRIORITY = new Set(["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"]);
const CREATE_PLAN_ACTION_RPC = "qlcl_create_plan_action_v2";

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
  const assignmentTargetType = String(body.assignment_target_type || (body.assignee_group_id ? "GROUP" : "USER")).trim().toUpperCase();
  const assigneeUserId = String(body.assignee_user_id || "").trim();
  const assigneeGroupId = String(body.assignee_group_id || "").trim();
  const dueDate = body.due_date ? String(body.due_date) : null;
  const expectedResult = String(body.expected_result || "").trim();
  const verificationRequirement = body.verification_requirement ? String(body.verification_requirement).trim() : null;
  const milestoneGroup = body.milestone_group ? String(body.milestone_group).trim() : null;
  const isRequired = body.is_required !== false;

  if (!title) return NextResponse.json({ error: "Nội dung nhiệm vụ là bắt buộc." }, { status: 400 });
  if (!leadDepartmentId) return NextResponse.json({ error: "Cần chọn khoa/phòng phụ trách." }, { status: 400 });
  if (!["USER","GROUP"].includes(assignmentTargetType)) return NextResponse.json({ error: "Đối tượng phân công không hợp lệ." }, { status: 400 });
  if (assignmentTargetType === "USER" && !assigneeUserId) return NextResponse.json({ error: "Cần chọn cá nhân phụ trách." }, { status: 400 });
  if (assignmentTargetType === "GROUP" && !assigneeGroupId) return NextResponse.json({ error: "Cần chọn nhóm phụ trách." }, { status: 400 });
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
  const deadlineWarning = dueDate < startDate
    ? "Hạn Action nằm trước ngày kế hoạch được phê duyệt; Action sẽ ở trạng thái quá hạn ngay khi tạo để giữ nguyên mốc đã được phê duyệt."
    : null;

  const { data: visibleRecord } = await auth.supabase.from("records").select("id,organization_id,work_year,lifecycle_status,record_code").eq("id", visibleProgram.record_id).maybeSingle();
  if (!visibleRecord || visibleRecord.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Kế hoạch không còn hoạt động hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const admin = createAdminClient();
  const [{ data: caller, error: callerError }, { data: department }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("departments").select("id,organization_id,is_active").eq("id", leadDepartmentId).maybeSingle(),
  ]);
  if (callerError || !caller?.organization_id || !caller.is_active || caller.organization_id !== visibleRecord.organization_id) return NextResponse.json({ error: callerError?.message || "Tài khoản hoặc phạm vi tổ chức không hợp lệ." }, { status: 403 });
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
    return NextResponse.json({ ok: true, action_id: result.action_id, record_id: result.record_id, record_code: result.record_code, start_date: startDate, warning: deadlineWarning, transaction: "atomic", result: tx });
  }
  if (isMissingRpcFunction(txError, CREATE_PLAN_ACTION_RPC)) {
    return NextResponse.json(
      { error: "Cơ sở dữ liệu chưa có RPC tạo Action từ Kế hoạch. Cần cập nhật migration trước khi tiếp tục." },
      { status: 503 },
    );
  }

  const txMessage = rpcErrorMessage(txError, "Không tạo được nhiệm vụ kế hoạch.");
  return NextResponse.json(
    { error: txMessage },
    { status: /required|invalid|outside organization|not found|must be in_progress|must be active/i.test(txMessage) ? 409 : 400 },
  );
}
