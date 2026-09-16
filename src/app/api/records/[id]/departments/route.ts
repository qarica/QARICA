import { NextResponse } from "next/server";
import { isRecordDepartmentRole, recordDepartmentManagePermissions } from "@/lib/record-department-policy";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PARTICIPANT_RPC = "qlcl_change_record_department_participant_v1";

async function changeParticipant(request: Request, recordId: string, operation: "UPSERT" | "REMOVE") {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  // Read through the caller's RLS context first. A module permission alone must
  // not allow someone to discover or mutate a confidential incident by UUID.
  const { data: record, error: recordError } = await supabase
    .from("records")
    .select("id,organization_id,record_type,lifecycle_status,owner_department_id")
    .eq("id", recordId)
    .maybeSingle();
  if (recordError || !record) return NextResponse.json({ error: recordError?.message || "Không tìm thấy hồ sơ hoặc bạn không có quyền truy cập." }, { status: 404 });
  if (record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Chỉ được cập nhật đơn vị tham gia khi hồ sơ đang hoạt động." }, { status: 409 });

  const permissions = recordDepartmentManagePermissions(record.record_type);
  if (!permissions.length) return NextResponse.json({ error: "Loại hồ sơ này chưa hỗ trợ quản lý đơn vị tham gia." }, { status: 403 });
  const permissionResults = await Promise.all(permissions.map((permission) => supabase.rpc("has_permission", { p_permission_code: permission })));
  if (!permissionResults.some((result) => result.data === true)) return NextResponse.json({ error: "Bạn chưa có quyền quản lý đơn vị tham gia của hồ sơ này." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const departmentId = String(body.department_id || "").trim();
  const participantRole = String(body.participant_role || "").trim().toUpperCase();
  const participationScope = String(body.participation_scope || "").trim() || null;
  if (!departmentId) return NextResponse.json({ error: "Cần chọn khoa/phòng tham gia." }, { status: 400 });
  if (!isRecordDepartmentRole(participantRole)) return NextResponse.json({ error: "Vai trò tham gia không hợp lệ." }, { status: 400 });
  if (participationScope && participationScope.length > 1000) return NextResponse.json({ error: "Phạm vi phối hợp không được vượt quá 1.000 ký tự." }, { status: 400 });
  if (departmentId === record.owner_department_id) return NextResponse.json({ error: "Khoa/phòng phụ trách chính đã được ghi riêng, không thêm trùng vào danh sách tham gia." }, { status: 409 });

  const admin = createAdminClient();
  const [{ data: caller, error: callerError }, { data: department, error: departmentError }] = await Promise.all([
    admin.from("profiles").select("user_id,organization_id,is_active").eq("user_id", user.id).maybeSingle(),
    admin.from("departments").select("id,organization_id,is_active").eq("id", departmentId).maybeSingle(),
  ]);
  if (callerError || !caller?.is_active || caller.organization_id !== record.organization_id) return NextResponse.json({ error: callerError?.message || "Tài khoản hoặc phạm vi bệnh viện không hợp lệ." }, { status: 403 });
  if (departmentError || !department?.is_active || department.organization_id !== record.organization_id) return NextResponse.json({ error: departmentError?.message || "Khoa/phòng không hợp lệ, đã ngưng hoạt động hoặc ngoài bệnh viện." }, { status: 400 });

  const { data, error } = await admin.rpc(PARTICIPANT_RPC, {
    p_record_id: recordId,
    p_actor_user_id: user.id,
    p_operation: operation,
    p_department_id: departmentId,
    p_participant_role: participantRole,
    p_participation_scope: participationScope,
  });
  if (error) {
    if (isMissingRpcFunction(error, PARTICIPANT_RPC)) return NextResponse.json({ error: "Cơ sở dữ liệu chưa được nâng cấp chức năng đơn vị tham gia." }, { status: 503 });
    const message = rpcErrorMessage(error, "Không cập nhật được đơn vị tham gia.");
    return NextResponse.json({ error: message }, { status: /not found|must be active|invalid|outside|duplicated/i.test(message) ? 409 : 400 });
  }
  return NextResponse.json({ ok: true, operation, result: data });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return changeParticipant(request, id, "UPSERT");
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return changeParticipant(request, id, "REMOVE");
}
