import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PermissionsPage() {
  const { user } = await requireUserContext();
  if (!user.permissions.includes("permissions.manage")) redirect("/dashboard?forbidden=1");
  const supabase = await createClient();
  const [rolesRes, permissionsRes, rolePermissionsRes, userPermissionsRes] = await Promise.all([
    supabase.from("roles").select("id,code,name,description,is_active").order("name"),
    supabase.from("permissions").select("id,code,name,module,is_active").order("module").order("name"),
    supabase.from("role_permissions").select("role_id,permission_id"),
    supabase.from("user_permissions").select("user_id,permission_id,is_allowed"),
  ]);
  const firstError = [rolesRes, permissionsRes, rolePermissionsRes, userPermissionsRes].find((result) => result.error)?.error;
  const roles = rolesRes.data ?? [];
  const permissions = permissionsRes.data ?? [];
  const rolePermissions = rolePermissionsRes.data ?? [];
  const userPermissions = userPermissionsRes.data ?? [];
  const permissionMap = new Map((permissions as any[]).map((row) => [row.id, row]));
  const grouped = new Map<string, any[]>();
  for (const row of permissions as any[]) {
    const key = row.module || "other";
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return <div className="page-stack" style={{ maxWidth: 1440, margin: "0 auto" }}>
    <PageHeader eyebrow="QUẢN TRỊ" title="Phân quyền" description="Tổng quan Role → Permission và các override theo người dùng. Chỉnh quyền chi tiết người dùng tiếp tục thực hiện trong màn hình Người dùng." actions={<Link className="button primary" href="/admin/users">Mở quản lý người dùng</Link>} />
    <section className="kpi-grid"><article className="kpi-card"><span>Vai trò</span><strong>{roles.length}</strong><small>Role hệ thống</small></article><article className="kpi-card"><span>Quyền chức năng</span><strong>{permissions.length}</strong><small>Permission đang cấu hình</small></article><article className="kpi-card"><span>Gán quyền theo Role</span><strong>{rolePermissions.length}</strong><small>Role permissions</small></article><article className="kpi-card warning"><span>Override theo user</span><strong>{userPermissions.length}</strong><small>Cho phép / từ chối riêng</small></article></section>
    {firstError ? <div className="alert error">Không tải được đầy đủ dữ liệu phân quyền: {firstError.message}</div> : null}
    <section className="panel"><div className="panel-title"><div><h2>Vai trò và số quyền mặc định</h2></div></div><div className="table-wrap"><table><thead><tr><th>Mã vai trò</th><th>Tên vai trò</th><th>Số quyền</th><th>Trạng thái</th></tr></thead><tbody>{(roles as any[]).map((role)=><tr key={role.id}><td><strong>{role.code}</strong></td><td>{role.name}<span className="subline">{role.description || ""}</span></td><td>{rolePermissions.filter((row:any)=>row.role_id===role.id && permissionMap.has(row.permission_id)).length}</td><td>{role.is_active ? "Đang hoạt động" : "Ngưng"}</td></tr>)}</tbody></table></div></section>
    <section className="panel"><div className="panel-title"><div><h2>Nhóm quyền theo module</h2></div></div><div className="table-wrap"><table><thead><tr><th>Module</th><th>Số quyền</th><th>Quyền</th></tr></thead><tbody>{Array.from(grouped.entries()).map(([module, list])=><tr key={module}><td><strong>{module}</strong></td><td>{list.length}</td><td>{list.map((permission:any)=>permission.code).join(", ")}</td></tr>)}</tbody></table></div></section>
  </div>;
}
