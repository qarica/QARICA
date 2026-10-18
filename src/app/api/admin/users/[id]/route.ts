import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const SET_USER_ACCESS_RPC = "qlcl_set_user_access_v1";

function sameIdSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((value) => set.has(value));
}

type UpdateUserBody = {
  role_ids?: unknown;
  effective_permission_ids?: unknown;
  full_name?: unknown;
  phone?: unknown;
  job_title?: unknown;
  primary_department_id?: unknown;
  scope_department_ids?: unknown;
  scope_mode?: unknown;
  is_active?: unknown;
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const permissionCheck = await requireApiPermission("permissions.manage");
  if (!permissionCheck.ok) return permissionCheck.response;
  const userCheck = await requireApiPermission("users.manage");
  if (!userCheck.ok) return userCheck.response;

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as UpdateUserBody;
  const roleIds = Array.isArray(body.role_ids)
    ? Array.from(new Set(body.role_ids.filter((value): value is string => typeof value === "string" && value.length > 0)))
    : [];
  const effectivePermissionIds = Array.isArray(body.effective_permission_ids)
    ? Array.from(new Set(body.effective_permission_ids.filter((value): value is string => typeof value === "string" && value.length > 0)))
    : [];
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const primaryDepartmentId = typeof body.primary_department_id === "string" && body.primary_department_id ? body.primary_department_id : null;
  const scopeDepartmentIds = Array.isArray(body.scope_department_ids)
    ? Array.from(new Set(body.scope_department_ids.filter((value): value is string => typeof value === "string" && value.length > 0)))
    : [];
  const scopeMode = String(body.scope_mode || "DEPARTMENT").toUpperCase();

  if (!roleIds.length || !fullName) return NextResponse.json({ error: "Cần có họ tên và ít nhất một vai trò." }, { status: 400 });
  if (!["HOSPITAL", "DEPARTMENT", "MULTI_DEPARTMENT"].includes(scopeMode)) return NextResponse.json({ error: "Phạm vi dữ liệu không hợp lệ." }, { status: 400 });
  if (scopeMode !== "HOSPITAL" && !scopeDepartmentIds.length) return NextResponse.json({ error: "Cần chọn ít nhất một khoa/phòng cho phạm vi dữ liệu." }, { status: 400 });

  // Caller and target must both be visible through the caller's RLS before any service-role mutation.
  const [{ data: callerVisible }, { data: targetVisible }] = await Promise.all([
    permissionCheck.supabase.from("profiles").select("user_id,organization_id,is_active").eq("user_id", permissionCheck.user.id).maybeSingle(),
    permissionCheck.supabase.from("profiles").select("user_id,organization_id,is_active").eq("user_id", id).maybeSingle(),
  ]);
  if (!callerVisible?.organization_id || !callerVisible.is_active) return NextResponse.json({ error: "Tài khoản quản trị không hợp lệ." }, { status: 403 });
  if (!targetVisible) return NextResponse.json({ error: "Không tìm thấy người dùng hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (targetVisible.organization_id !== callerVisible.organization_id) return NextResponse.json({ error: "Không được thay đổi người dùng thuộc bệnh viện khác." }, { status: 403 });
  if (typeof body.is_active === "boolean" && !body.is_active && id === permissionCheck.user.id) {
    return NextResponse.json({ error: "Không thể tự ngưng hoạt động tài khoản của chính mình." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Không cho tự nâng quyền cho chính mình: so với vai trò/quyền hiện có, nếu
  // người gọi đang sửa đúng hồ sơ của mình thì role_ids/effective_permission_ids
  // gửi lên phải giữ nguyên — mọi thay đổi khác (tên, SĐT, khoa/phòng...) vẫn
  // được phép. Cùng nguyên tắc với chặn tự xác minh EMR / tự phê duyệt CAPA.
  if (id === permissionCheck.user.id) {
    const [{ data: currentRoleRows }, { data: currentOverrideRows }] = await Promise.all([
      admin.from("user_roles").select("role_id").eq("user_id", id),
      admin.from("user_permissions").select("permission_id,is_allowed").eq("user_id", id),
    ]);
    const currentRoleIds = (currentRoleRows ?? []).map((row) => row.role_id as string);
    if (!sameIdSet(roleIds, currentRoleIds)) {
      return NextResponse.json({ error: "Không thể tự thay đổi vai trò của chính mình. Nhờ một quản trị viên khác thực hiện." }, { status: 400 });
    }
    const { data: rolePermissionRows } = await admin.from("role_permissions").select("permission_id").in("role_id", currentRoleIds.length ? currentRoleIds : [""]);
    const currentEffective = new Set((rolePermissionRows ?? []).map((row) => row.permission_id as string));
    for (const row of currentOverrideRows ?? []) {
      if (row.is_allowed) currentEffective.add(row.permission_id as string);
      else currentEffective.delete(row.permission_id as string);
    }
    if (!sameIdSet(effectivePermissionIds, [...currentEffective])) {
      return NextResponse.json({ error: "Không thể tự thay đổi quyền chức năng của chính mình. Nhờ một quản trị viên khác thực hiện." }, { status: 400 });
    }
  }

  const { data: tx, error: txError } = await admin.rpc(SET_USER_ACCESS_RPC, {
    p_target_user_id: id,
    p_actor_user_id: permissionCheck.user.id,
    p_payload: {
      full_name: fullName,
      phone: typeof body.phone === "string" ? body.phone : null,
      job_title: typeof body.job_title === "string" ? body.job_title : null,
      primary_department_id: primaryDepartmentId,
      role_ids: roleIds,
      effective_permission_ids: effectivePermissionIds,
      scope_mode: scopeMode,
      scope_department_ids: scopeDepartmentIds,
    },
  });

  if (!txError) {
    // Trạng thái hoạt động (khóa/mở khóa) không nằm trong RPC giao dịch phân
    // quyền — cập nhật riêng, đơn giản, không ảnh hưởng vai trò/quyền đã lưu.
    if (typeof body.is_active === "boolean") {
      const { error: activeError } = await admin.from("profiles").update({ is_active: body.is_active }).eq("user_id", id);
      if (activeError) return NextResponse.json({ error: "Đã lưu phân quyền nhưng không cập nhật được trạng thái hoạt động: " + activeError.message }, { status: 500 });
    }
    await admin.from("audit_logs").insert({
      actor_user_id: permissionCheck.user.id,
      table_name: "profiles",
      row_id: id,
      action_type: typeof body.is_active === "boolean" ? (body.is_active ? "USER_REACTIVATE" : "USER_DEACTIVATE") : "USER_ACCESS_UPDATE",
      new_value: { full_name: fullName, role_ids: roleIds, effective_permission_ids: effectivePermissionIds, scope_mode: scopeMode, scope_department_ids: scopeDepartmentIds, primary_department_id: primaryDepartmentId, is_active: typeof body.is_active === "boolean" ? body.is_active : undefined },
      reason: "Cập nhật phân quyền/thông tin người dùng.",
      request_meta: { source: "qlcl-ui" },
    });
    return NextResponse.json({ ok: true, transaction: "atomic", result: tx });
  }

  if (isMissingRpcFunction(txError, SET_USER_ACCESS_RPC)) {
    // Permission changes are intentionally fail-closed. The previous delete/insert fallback
    // could leave a user with partial roles/scopes when a later write failed.
    return NextResponse.json(
      { error: "Chức năng phân quyền an toàn chưa được kích hoạt trên cơ sở dữ liệu. Không có thay đổi nào được thực hiện." },
      { status: 503 },
    );
  }

  const message = rpcErrorMessage(txError, "Không cập nhật được cấu hình người dùng.");
  return NextResponse.json({ error: message }, { status: /invalid|outside organization|another organization|required|inactive|not found/i.test(message) ? 409 : 400 });
}
