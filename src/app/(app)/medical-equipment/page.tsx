import { PageHeader } from "@/components/page-header";
import { MedicalEquipmentClient } from "@/components/medical-equipment-client";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function MedicalEquipmentPage() {
  const { user } = await requireUserContext();
  requirePermission(user, "medical_equipment.view");
  const canManage = hasPermission(user, "medical_equipment.manage");
  const supabase = await createClient();

  const [{ data: equipment, error }, departmentsRes] = await Promise.all([
    supabase
      .from("medical_equipment")
      .select("id,sequence_no,equipment_name,model_code,manufacturer,origin_country,year_manufactured,year_in_use,machine_code,registration_number,contract_from,contract_to,valid_from,department_id,department_label,notes,is_active")
      .eq("organization_id", user.organizationId)
      .order("sequence_no", { ascending: true, nullsFirst: false })
      .order("equipment_name", { ascending: true }),
    supabase.from("departments").select("id,name").eq("organization_id", user.organizationId).eq("is_active", true).order("name"),
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="QUẢN TRỊ"
        title="Sổ quản lý TTBYT"
        description="Sổ theo dõi trang thiết bị y tế: hãng sản xuất, năm SX/SD, mã máy, số lưu hành, hạn hợp đồng/hiệu lực và khoa sử dụng."
        icon="network"
      />
      {error ? <div className="alert error">Không tải được danh sách thiết bị: {error.message}</div> : null}
      <MedicalEquipmentClient initialEquipment={(equipment ?? []) as any[]} departments={(departmentsRes.data ?? []) as any[]} canManage={canManage} />
    </div>
  );
}
