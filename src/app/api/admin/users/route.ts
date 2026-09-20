import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const SET_USER_ACCESS_RPC = "qlcl_set_user_access_v1";
const INTERNAL_LOGIN_DOMAIN = "qarica.com";

function normalizeLoginName(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function loginToAuthEmail(loginName: string) {
  if (loginName.includes("@")) return loginName;
  return `${loginName}@${INTERNAL_LOGIN_DOMAIN}`;
}

function validUsername(username: string) {
  return /^[a-z0-9][a-z0-9._-]{2,39}$/.test(username);
}

async function access() {
  const a = await requireApiPermission("users.manage");
  if (!a.ok) return a;
  const b = await requireApiPermission("permissions.manage");
  if (!b.ok) return b;
  return a;
}

export async function POST(request: Request) {
  const a = await access();
  if (!a.ok) return a.response;
  const body = await request.json().catch(() => ({}));
  const loginName = normalizeLoginName(body.username || body.login_name || body.email);
  const password = String(body.password || "");
  const fullName = String(body.full_name || "").trim();
  const roleIds = Array.isArray(body.role_ids) ? Array.from(new Set(body.role_ids.filter((x: unknown): x is string => typeof x === "string" && !!x))) : [];
  const effectivePermissionIds = Array.isArray(body.effective_permission_ids) ? Array.from(new Set(body.effective_permission_ids.filter((x: unknown): x is string => typeof x === "string" && !!x))) : [];
  const scopeDepartmentIds = Array.isArray(body.scope_department_ids) ? Array.from(new Set(body.scope_department_ids.filter((x: unknown): x is string => typeof x === "string" && !!x))) : [];
  const scopeMode = String(body.scope_mode || "DEPARTMENT").toUpperCase();
  const primaryDepartmentId = body.primary_department_id ? String(body.primary_department_id) : null;

  if (!loginName || !fullName || password.length < 8 || !roleIds.length) return NextResponse.json({ error: "Thiếu thông tin bắt buộc hoặc mật khẩu dưới 8 ký tự." }, { status: 400 });
  if (!loginName.includes("@") && !validUsername(loginName)) return NextResponse.json({ error: "Tài khoản đăng nhập dùng 3–40 ký tự: chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang." }, { status: 400 });
  if (!["HOSPITAL", "DEPARTMENT", "MULTI_DEPARTMENT"].includes(scopeMode)) return NextResponse.json({ error: "Phạm vi dữ liệu không hợp lệ." }, { status: 400 });
  if (scopeMode !== "HOSPITAL" && !scopeDepartmentIds.length) return NextResponse.json({ error: "Cần chọn ít nhất một khoa/phòng cho phạm vi dữ liệu." }, { status: 400 });

  const { data: callerVisible } = await a.supabase.from("profiles").select("organization_id,is_active").eq("user_id", a.user.id).maybeSingle();
  if (!callerVisible?.organization_id || !callerVisible.is_active) return NextResponse.json({ error: "Tài khoản quản trị chưa gắn bệnh viện hoặc đã ngưng hoạt động." }, { status: 403 });

  const admin = createAdminClient();
  const requiredDepartmentIds = Array.from(new Set([...(primaryDepartmentId ? [primaryDepartmentId] : []), ...(scopeMode === "HOSPITAL" ? [] : scopeDepartmentIds)]));
  const [{ data: validDepartments }, { data: validRoles }, { data: validPermissions }] = await Promise.all([
    requiredDepartmentIds.length ? admin.from("departments").select("id").eq("organization_id", callerVisible.organization_id).eq("is_active", true).in("id", requiredDepartmentIds) : Promise.resolve({ data: [], error: null }),
    admin.from("roles").select("id").eq("is_active", true).in("id", roleIds),
    effectivePermissionIds.length ? admin.from("permissions").select("id").eq("is_active", true).in("id", effectivePermissionIds) : Promise.resolve({ data: [], error: null }),
  ] as any);
  if ((validDepartments ?? []).length !== requiredDepartmentIds.length) return NextResponse.json({ error: "Khoa/phòng chính hoặc phạm vi dữ liệu không thuộc bệnh viện hiện tại." }, { status: 400 });
  if ((validRoles ?? []).length !== roleIds.length) return NextResponse.json({ error: "Có vai trò không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
  if ((validPermissions ?? []).length !== effectivePermissionIds.length) return NextResponse.json({ error: "Có quyền chức năng không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });

  const authEmail = loginToAuthEmail(loginName);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, login_name: loginName, internal_login: !loginName.includes("@") },
  });
  if (createError || !created.user) return NextResponse.json({ error: createError?.message || "Không tạo được tài khoản đăng nhập." }, { status: 400 });
  const userId = created.user.id;

  const { data: tx, error: txError } = await admin.rpc(SET_USER_ACCESS_RPC, {
    p_target_user_id: userId,
    p_actor_user_id: a.user.id,
    p_payload: {
      full_name: fullName,
      phone: body.phone || null,
      job_title: body.job_title || null,
      primary_department_id: primaryDepartmentId,
      role_ids: roleIds,
      effective_permission_ids: effectivePermissionIds,
      scope_mode: scopeMode,
      scope_department_ids: scopeDepartmentIds,
    },
  });

  if (!txError) return NextResponse.json({ ok: true, user_id: userId, login_name: loginName, transaction: "atomic", result: tx });

  await admin.auth.admin.deleteUser(userId);

  if (isMissingRpcFunction(txError, SET_USER_ACCESS_RPC)) {
    return NextResponse.json(
      { error: "Chức năng tạo người dùng an toàn chưa được kích hoạt trên cơ sở dữ liệu. Tài khoản vừa tạo đã được thu hồi và không có cấu hình phân quyền nào được lưu." },
      { status: 503 },
    );
  }

  const message = rpcErrorMessage(txError, "Không thể hoàn tất cấu hình người dùng.");
  return NextResponse.json({ error: message }, { status: /invalid|outside organization|another organization|required|inactive|not found/i.test(message) ? 409 : 400 });
}
