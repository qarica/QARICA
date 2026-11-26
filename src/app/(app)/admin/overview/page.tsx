import Link from "next/link";
import { redirect } from "next/navigation";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { requireUserContext } from "@/lib/auth";
import { MODULE_UX_TYPE_COUNT } from "@/lib/module-ux";
import { createClient } from "@/lib/supabase/server";

export default async function AdminOverviewPage() {
  const { user } = await requireUserContext();
  const canUsers = user.permissions.includes("users.manage");
  const canDepartments = user.permissions.includes("departments.manage");
  const canPermissions = user.permissions.includes("permissions.manage");
  const canSystem = user.permissions.includes("system.manage");
  if (!canUsers && !canDepartments && !canPermissions && !canSystem) redirect("/dashboard?forbidden=1");

  const supabase = await createClient();
  const [profilesRes, departmentsRes, rolesRes, userRolesRes, recordTypesRes, notificationsRes] = await Promise.all([
    canUsers ? supabase.from("profiles").select("user_id,full_name,email,primary_department_id,is_active,created_at").order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[], error: null }),
    canDepartments || canUsers ? supabase.from("departments").select("id,code,name,short_name,is_active").order("name") : Promise.resolve({ data: [] as any[], error: null }),
    canPermissions ? supabase.from("roles").select("id,code,name,description,is_active").order("name") : Promise.resolve({ data: [] as any[], error: null }),
    canUsers || canPermissions ? supabase.from("user_roles").select("user_id,role_id") : Promise.resolve({ data: [] as any[], error: null }),
    canSystem ? supabase.from("record_types").select("code,route_template").order("code") : Promise.resolve({ data: [] as any[], error: null }),
    canSystem ? supabase.from("notifications").select("notification_type").limit(2000) : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  const firstError = [profilesRes, departmentsRes, rolesRes, userRolesRes, recordTypesRes, notificationsRes].find((r) => r.error)?.error;

  const profiles = (profilesRes.data ?? []) as any[];
  const departments = (departmentsRes.data ?? []) as any[];
  const roles = (rolesRes.data ?? []) as any[];
  const userRoles = (userRolesRes.data ?? []) as any[];
  const recordTypes = (recordTypesRes.data ?? []) as any[];
  const notificationTypeCount = new Set(((notificationsRes.data ?? []) as any[]).map((n: any) => n.notification_type).filter(Boolean)).size;

  const departmentMap = new Map(departments.map((d: any) => [d.id, d.short_name || d.name]));
  const roleMap = new Map(roles.map((r: any) => [r.id, r.name]));
  const rolesByUser = new Map<string, string[]>();
  for (const ur of userRoles) { const list = rolesByUser.get(ur.user_id) ?? []; const name = roleMap.get(ur.role_id); if (name) list.push(name); rolesByUser.set(ur.user_id, list); }
  const usersByRole = new Map<string, number>();
  for (const ur of userRoles) usersByRole.set(ur.role_id, (usersByRole.get(ur.role_id) ?? 0) + 1);
  const usersByDepartment = new Map<string, number>();
  for (const p of profiles) if (p.primary_department_id) usersByDepartment.set(p.primary_department_id, (usersByDepartment.get(p.primary_department_id) ?? 0) + 1);

  const activeUsers = profiles.filter((p: any) => p.is_active).length;
  const activeDepartments = departments.filter((d: any) => d.is_active).length;
  const activeRoles = roles.filter((r: any) => r.is_active).length;
  const recentProfiles = profiles.slice(0, 6);
  const recentDepartments = departments.slice(0, 6);

  return <div className="page-stack admin-overview" style={{ maxWidth: 1440, margin: "0 auto" }}>
    <style>{`
      .admin-overview .kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .admin-overview .panel-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      @media(max-width:1100px){.admin-overview .kpis{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:900px){.admin-overview .panel-grid{grid-template-columns:1fr}}
    `}</style>
    <PageHeader eyebrow="HỆ THỐNG" title="Cấu hình hệ thống" description="Quản lý danh mục, tham số, quyền truy cập và thiết lập hệ thống theo nhu cầu tổ chức." icon="settings" />
    {firstError ? <div className="alert error">Không tải được đầy đủ dữ liệu quản trị: {firstError.message}</div> : null}

    <section className="kpis">
      {canUsers ? <KpiCard icon="users" tone="blue" label={`Tổng người dùng · ${activeUsers} đang hoạt động`} value={profiles.length} /> : null}
      {canPermissions ? <KpiCard icon="shield-check" tone="purple" label={`Vai trò · ${activeRoles} đã cấu hình`} value={roles.length} /> : null}
      {(canDepartments || canUsers) ? <KpiCard icon="building-2" tone="green" label={`Khoa/Phòng · ${activeDepartments} đang sử dụng`} value={departments.length} /> : null}
      {canSystem ? <KpiCard icon="list-tree" tone="amber" label="Danh mục chính" value={recordTypes.length} /> : null}
      {canSystem ? <KpiCard icon="workflow" tone="blue" label="Quy trình nghiệp vụ đã cấu hình" value={MODULE_UX_TYPE_COUNT} /> : null}
      {canSystem ? <KpiCard icon="bell" tone="purple" label="Loại thông báo đã ghi nhận" value={notificationTypeCount} /> : null}
    </section>

    <section className="panel-grid">
      {canUsers ? <article className="panel">
        <div className="panel-title"><div><h2>Người dùng gần đây</h2><p>Danh sách người dùng được tạo hoặc cập nhật gần đây nhất.</p></div><Link className="button primary small" href="/admin/users">+ Thêm người dùng</Link></div>
        <div className="table-wrap"><table><thead><tr><th>Họ tên</th><th>Vai trò</th><th>Khoa/Phòng</th><th>Trạng thái</th></tr></thead><tbody>{recentProfiles.map((p: any) => <tr key={p.user_id}><td><strong>{p.full_name || p.email}</strong><span className="subline">{p.email}</span></td><td>{(rolesByUser.get(p.user_id) || []).join(", ") || "—"}</td><td>{p.primary_department_id ? departmentMap.get(p.primary_department_id) || "—" : "—"}</td><td><span className={`status-badge ${p.is_active ? "success" : "muted"}`}>{p.is_active ? "Đang hoạt động" : "Tạm khóa"}</span></td></tr>)}{!recentProfiles.length ? <tr><td colSpan={4}><div className="empty-state">Chưa có người dùng.</div></td></tr> : null}</tbody></table></div>
        <Link className="link-button" href="/admin/users">Xem tất cả người dùng →</Link>
      </article> : null}
      {(canDepartments || canUsers) ? <article className="panel">
        <div className="panel-title"><div><h2>Khoa/Phòng</h2><p>Danh sách khoa/phòng trong hệ thống.</p></div>{canDepartments ? <Link className="button primary small" href="/admin/departments">+ Thêm khoa/phòng</Link> : null}</div>
        <div className="table-wrap"><table><thead><tr><th>Tên khoa/phòng</th><th>Mã</th><th>Người dùng</th><th>Trạng thái</th></tr></thead><tbody>{recentDepartments.map((d: any) => <tr key={d.id}><td><strong>{d.short_name || d.name}</strong></td><td>{d.code || "—"}</td><td>{usersByDepartment.get(d.id) || 0}</td><td><span className={`status-badge ${d.is_active ? "success" : "muted"}`}>{d.is_active ? "Đang hoạt động" : "Ngưng"}</span></td></tr>)}{!recentDepartments.length ? <tr><td colSpan={4}><div className="empty-state">Chưa có khoa/phòng.</div></td></tr> : null}</tbody></table></div>
        {canDepartments ? <Link className="link-button" href="/admin/departments">Xem tất cả khoa/phòng →</Link> : null}
      </article> : null}
    </section>

    <section className="panel-grid">
      {canPermissions ? <article className="panel">
        <div className="panel-title"><div><h2>Vai trò & Phân quyền</h2><p>Danh sách vai trò và số người dùng được gán.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Tên vai trò</th><th>Mô tả</th><th>Số người dùng</th><th>Trạng thái</th></tr></thead><tbody>{roles.map((r: any) => <tr key={r.id}><td><strong>{r.name}</strong></td><td>{r.description || "—"}</td><td>{usersByRole.get(r.id) || 0}</td><td><span className={`status-badge ${r.is_active ? "success" : "muted"}`}>{r.is_active ? "Hoạt động" : "Ngưng"}</span></td></tr>)}{!roles.length ? <tr><td colSpan={4}><div className="empty-state">Chưa có vai trò.</div></td></tr> : null}</tbody></table></div>
        <Link className="link-button" href="/admin/permissions">Xem tất cả vai trò →</Link>
      </article> : null}
      {canSystem ? <article className="panel">
        <div className="panel-title"><div><h2>Danh mục hệ thống</h2><p>Loại hồ sơ dùng để định tuyến và phân loại Registry trung tâm.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Mã loại</th><th>Route</th></tr></thead><tbody>{recordTypes.map((t: any) => <tr key={t.code}><td><strong>{t.code}</strong></td><td>{t.route_template || "—"}</td></tr>)}{!recordTypes.length ? <tr><td colSpan={2}><div className="empty-state">Chưa có danh mục.</div></td></tr> : null}</tbody></table></div>
        <Link className="link-button" href="/admin/catalogs">Xem tất cả danh mục →</Link>
      </article> : null}
    </section>
  </div>;
}
