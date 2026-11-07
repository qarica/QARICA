import { AdminOrgChartClient } from "@/components/admin-org-chart-client";
import { PageHeader } from "@/components/page-header";
import { requirePermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Giai đoạn 1 của "Sơ đồ tổ chức": cây khoa/phòng theo parent_department_id
// (đã sửa đúng dữ liệu thật) + ghép Nhân sự (profiles.primary_department_id)
// và Trang thiết bị (medical_equipment.department_id) đã có sẵn. Báo cáo
// thực tế tiếp theo: "phải vẽ sơ đồ bố trí theo tầng" — thêm field cấu hình
// floor_order/floor_label/room_label/area_sqm (nhập ở trang Khoa/Phòng,
// không hard-code mặt bằng 1 bệnh viện cụ thể) để vẽ lưới theo tầng, màu
// theo loại đơn vị. Quyết định thành lập/Giường/Bàn khám/DVKT để giai đoạn
// sau.
export default async function OrgChartPage() {
  const { user } = await requireUserContext();
  requirePermission(user, "departments.manage");
  const supabase = await createClient();
  const [{ data: departments, error }, { data: people }, { data: equipment }] = await Promise.all([
    supabase.from("departments").select("id,code,name,short_name,department_type,parent_department_id,is_active,floor_order,floor_label,room_label,area_sqm,bed_count,org_origin,org_summary").order("name"),
    supabase.from("profiles").select("user_id,full_name,email,job_title,primary_department_id,is_active").eq("is_active", true).order("full_name"),
    supabase.from("medical_equipment").select("id,equipment_name,model_code,status,department_id").order("equipment_name"),
  ]);
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="QUẢN TRỊ"
        title="Sơ đồ tổ chức"
        description="Cây khoa/phòng theo đơn vị cha và sơ đồ bố trí theo tầng — bấm vào một đơn vị để xem nhân sự và trang thiết bị đang gắn tại đó."
        icon="network"
      />
      {error ? <div className="alert error">Không tải được danh mục: {error.message}</div> : null}
      <AdminOrgChartClient
        departments={(departments ?? []) as any[]}
        people={(people ?? []) as any[]}
        equipment={(equipment ?? []) as any[]}
      />
    </div>
  );
}
