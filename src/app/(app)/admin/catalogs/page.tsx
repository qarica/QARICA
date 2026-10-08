import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CatalogsPage() {
  const { user } = await requireUserContext();
  if (!user.permissions.includes("system.manage")) redirect("/dashboard?forbidden=1");
  const supabase = await createClient();
  const [typesRes, departmentsRes, rolesRes] = await Promise.all([
    supabase.from("record_types").select("code,route_template").order("code"),
    supabase.from("departments").select("id,code,name,short_name,is_active").order("name"),
    supabase.from("roles").select("id,code,name,is_active").order("name"),
  ]);
  const firstError = [typesRes, departmentsRes, rolesRes].find((result) => result.error)?.error;
  const types = typesRes.data ?? [];
  const departments = departmentsRes.data ?? [];
  const roles = rolesRes.data ?? [];

  return <div className="page-stack" style={{ maxWidth: 1440, margin: "0 auto" }}>
    <PageHeader eyebrow="QUẢN TRỊ" title="Danh mục" description="Tổng hợp CHỈ XEM các danh mục dùng chung của hệ thống. Khoa/Phòng chỉnh sửa ở trang riêng (nút bên dưới); Loại hồ sơ gắn trực tiếp với route/code nên không chỉnh qua UI; Vai trò hiện chỉ gán cho từng người dùng ở trang Người dùng, chưa có màn hình tạo/sửa định nghĩa vai trò." icon="list-tree" />
    <section className="kpi-grid"><article className="kpi-card"><span>Loại hồ sơ</span><strong>{types.length}</strong><small>Registry trung tâm</small></article><article className="kpi-card"><span>Khoa / Phòng</span><strong>{departments.length}</strong><small>{departments.filter((row:any)=>row.is_active).length} đang hoạt động</small></article><article className="kpi-card"><span>Vai trò</span><strong>{roles.length}</strong><small>{roles.filter((row:any)=>row.is_active).length} đang hoạt động</small></article><article className="kpi-card success"><span>Trạng thái</span><strong>CHỈ XEM</strong><small>Xem chi tiết hoặc chỉnh sửa ở các trang chuyên biệt</small></article></section>
    {firstError ? <div className="alert error">Không tải được đầy đủ danh mục: {firstError.message}</div> : null}
    <section className="panel"><div className="panel-title"><div><h2>Loại hồ sơ nghiệp vụ</h2><p>Dùng để định tuyến và phân loại Registry trung tâm. Đây là danh mục hệ thống gắn trực tiếp với mã nguồn/route — không chỉnh sửa qua UI.</p></div></div><div className="table-wrap"><table><thead><tr><th>Mã loại</th><th>Route</th></tr></thead><tbody>{types.map((row:any)=><tr key={row.code}><td><strong>{row.code}</strong></td><td>{row.route_template || "—"}</td></tr>)}</tbody></table></div></section>
    <section className="panel"><div className="panel-title"><div><h2>Khoa / Phòng</h2><p>Xem nhanh tại đây; thêm/sửa/ngưng hoạt động ở trang Khoa/Phòng.</p></div><Link className="button secondary small" href="/admin/departments">Đi đến trang Khoa/Phòng →</Link></div><div className="table-wrap"><table><thead><tr><th>Mã</th><th>Tên đơn vị</th><th>Tên ngắn</th><th>Trạng thái</th></tr></thead><tbody>{departments.map((row:any)=><tr key={row.id}><td>{row.code || "—"}</td><td><strong>{row.name}</strong></td><td>{row.short_name || "—"}</td><td>{row.is_active ? "Đang hoạt động" : "Ngưng"}</td></tr>)}</tbody></table></div></section>
    <section className="panel"><div className="panel-title"><div><h2>Vai trò</h2><p>Gán vai trò cho từng người dùng ở trang Người dùng; chưa có màn hình tạo/sửa định nghĩa vai trò (tên, mô tả) riêng.</p></div><Link className="button secondary small" href="/admin/users">Đi đến trang Người dùng →</Link></div><div className="table-wrap"><table><thead><tr><th>Mã</th><th>Tên vai trò</th><th>Trạng thái</th></tr></thead><tbody>{roles.map((row:any)=><tr key={row.id}><td>{row.code}</td><td><strong>{row.name}</strong></td><td>{row.is_active ? "Đang hoạt động" : "Ngưng"}</td></tr>)}</tbody></table></div></section>
  </div>;
}
