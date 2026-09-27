import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdminOverviewPage() {
  const { user } = await requireUserContext();
  const canUsers = user.permissions.includes("users.manage");
  const canDepartments = user.permissions.includes("departments.manage");
  const canPermissions = user.permissions.includes("permissions.manage");
  const canSystem = user.permissions.includes("system.manage");
  if (!canUsers && !canDepartments && !canPermissions && !canSystem) redirect("/dashboard?forbidden=1");

  const supabase = await createClient();
  const [profilesRes, departmentsRes, rolesRes, userRolesRes, recordTypesRes] = await Promise.all([
    canUsers ? supabase.from("profiles").select("user_id,full_name,email,primary_department_id,is_active,created_at").order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[], error: null }),
    canDepartments || canUsers ? supabase.from("departments").select("id,code,name,short_name,is_active").order("name") : Promise.resolve({ data: [] as any[], error: null }),
    canPermissions ? supabase.from("roles").select("id,code,name,description,is_active").order("name") : Promise.resolve({ data: [] as any[], error: null }),
    canUsers || canPermissions ? supabase.from("user_roles").select("user_id,role_id") : Promise.resolve({ data: [] as any[], error: null }),
    canSystem ? supabase.from("record_types").select("code,route_template").order("code") : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  const firstError = [profilesRes, departmentsRes, rolesRes, userRolesRes, recordTypesRes].find((r) => r.error)?.error;

  const profiles = (profilesRes.data ?? []) as any[];
  const departments = (departmentsRes.data ?? []) as any[];
  const roles = (rolesRes.data ?? []) as any[];
  const userRoles = (userRolesRes.data ?? []) as any[];
  const recordTypes = (recordTypesRes.data ?? []) as any[];

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
      .admin-overview .kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.admin-overview .kpi-card{background:#fff;border:1px solid #e5eaf2;border-radius:14px;padding:16px;box-shadow:0 1px 2px rgba(15,23,42,.03)}.admin-overview .kpi-icon{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;margin-bottom:12px}.admin-overview .kpi-icon.blue{background:#3b82f6}.admin-overview .kpi-icon.green{background:#22c55e}.admin-overview .kpi-icon.purple{background:#8b5cf6}.admin-overview .kpi-icon.amber{background:#f59e0b}.admin-overview .kpi-value{font-size:26px;font-weight:800;color:#0f172a}.admin-overview .kpi-title{font-size:12.5px;color:#475569;font-weight:600;margin-top:2px}
      .admin-overview .panel-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      @media(max-width:1100px){.admin-overview .kpis{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:900px){.admin-overview .panel-grid{grid-template-columns:1fr}}
    `}</style>
    <PageHeader eyebrow="HỆ THỐNG" title="Cấu hình hệ thống" description="Quản lý danh mục, tham số, quyền truy cập và thiết lập hệ thống theo nhu cầu tổ chức." icon="settings" />
    {firstError ? <div className="alert error">Không tải được đầy đủ dữ liệu quản trị: {firstError.message}</div> : null}

    <section className="kpis">
      {canUsers ? <article className="kpi-card"><span className="kpi-icon blue"><Icon name="users" size={18} /></span><div className="kpi-value">{profiles.length}</div><div className="kpi-title">Tổng người dùng · {activeUsers} đang hoạt động</div></article> : null}
      {canPermissions ? <article className="kpi-card"><span className="kpi-icon purple"><Icon name="shield-check" size={18} /></span><div className="kpi-value">{roles.length}</div><div className="kpi-title">Vai trò · {activeRoles} đã cấu hình</div></article> : null}
      {(canDepartments || canUsers) ? <article className="kpi-card"><span className="kpi-icon green"><Icon name="building-2" size={18} /></span><div className="kpi-value">{departments.length}</div><div className="kpi-title">Khoa/Phòng · {activeDepartments} đang sử dụng</div></article> : null}
      {canSystem ? <article className="kpi-card"><span className="kpi-icon amber"><Icon name="list-tree" size={18} /></span><div className="kpi-value">{recordTypes.length}</div><div className="kpi-title">Danh mục chính</div></article> : null}
    </section>

    <section className="panel-grid">
      {canUsers ? <article className="panel">
        <div className="panel-title"><div><h2>Người dùng gần đây</h2><p>Danh sách người dùng được tạo hoặc cập nhật gần đây nhất.</p></div><Link className="link-button" href="/admin/users">Xem tất cả người dùng →</Link></div>
        <div className="table-wrap"><table><thead><tr><th>Họ tên</th><th>Vai trò</th><th>Khoa/Phòng</th><th>Trạng thái</th></tr></thead><tbody>{recentProfiles.map((p: any) => <tr key={p.user_id}><td><strong>{p.full_name || p.email}</strong><span className="subline">{p.email}</span></td><td>{(rolesByUser.get(p.user_id) || []).join(", ") || "—"}</td><td>{p.primary_department_id ? departmentMap.get(p.primary_department_id) || "—" : "—"}</td><td><span className={`status-badge ${p.is_active ? "success" : "muted"}`}>{p.is_active ? "Đang hoạt động" : "Tạm khóa"}</span></td></tr>)}{!recentProfiles.length ? <tr><td colSpan={4}><div className="empty-state">Chưa có người dùng.</div></td></tr> : null}</tbody></table></div>
      </article> : null}
      {(canDepartments || canUsers) ? <article className="panel">
        <div className="panel-title"><div><h2>Khoa/Phòng</h2><p>Danh sách khoa/phòng trong hệ thống.</p></div>{canDepartments ? <Link className="link-button" href="/admin/departments">Xem tất cả khoa/phòng →</Link> : null}</div>
        <div className="table-wrap"><table><thead><tr><th>Tên khoa/phòng</th><th>Mã</th><th>Người dùng</th><th>Trạng thái</th></tr></thead><tbody>{recentDepartments.map((d: any) => <tr key={d.id}><td><strong>{d.short_name || d.name}</strong></td><td>{d.code || "—"}</td><td>{usersByDepartment.get(d.id) || 0}</td><td><span className={`status-badge ${d.is_active ? "success" : "muted"}`}>{d.is_active ? "Đang hoạt động" : "Ngưng"}</span></td></tr>)}{!recentDepartments.length ? <tr><td colSpan={4}><div className="empty-state">Chưa có khoa/phòng.</div></td></tr> : null}</tbody></table></div>
      </article> : null}
    </section>

    <section className="panel-grid">
      {canPermissions ? <article className="panel">
        <div className="panel-title"><div><h2>Vai trò & Phân quyền</h2><p>Danh sách vai trò và số người dùng được gán.</p></div><Link className="link-button" href="/admin/permissions">Xem tất cả vai trò →</Link></div>
        <div className="table-wrap"><table><thead><tr><th>Tên vai trò</th><th>Mô tả</th><th>Số người dùng</th><th>Trạng thái</th></tr></thead><tbody>{roles.map((r: any) => <tr key={r.id}><td><strong>{r.name}</strong></td><td>{r.description || "—"}</td><td>{usersByRole.get(r.id) || 0}</td><td><span className={`status-badge ${r.is_active ? "success" : "muted"}`}>{r.is_active ? "Hoạt động" : "Ngưng"}</span></td></tr>)}{!roles.length ? <tr><td colSpan={4}><div className="empty-state">Chưa có vai trò.</div></td></tr> : null}</tbody></table></div>
      </article> : null}
      {canSystem ? <article className="panel">
        <div className="panel-title"><div><h2>Danh mục hệ thống</h2><p>Loại hồ sơ dùng để định tuyến và phân loại Registry trung tâm.</p></div><Link className="link-button" href="/admin/catalogs">Xem tất cả danh mục →</Link></div>
        <div className="table-wrap"><table><thead><tr><th>Mã loại</th><th>Route</th></tr></thead><tbody>{recordTypes.map((t: any) => <tr key={t.code}><td><strong>{t.code}</strong></td><td>{t.route_template || "—"}</td></tr>)}{!recordTypes.length ? <tr><td colSpan={2}><div className="empty-state">Chưa có danh mục.</div></td></tr> : null}</tbody></table></div>
      </article> : null}
    </section>
  </div>;
}
