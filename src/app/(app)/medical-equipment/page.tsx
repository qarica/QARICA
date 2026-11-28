import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { MedicalEquipmentClient } from "@/components/medical-equipment-client";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NavGroupBar } from "@/components/nav-group-bar";

export default async function MedicalEquipmentPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  // Bộ lọc từ thanh "Cần xử lý" (?filter=...): chỉ lọc danh sách hiển thị, ô chỉ số tổng giữ nguyên.
  const filterRaw = String((await searchParams).filter || "");
  const FILTER_LABEL: Record<string, string> = { maintenance: "Thiết bị đang bảo trì / sửa chữa" };
  const filter = FILTER_LABEL[filterRaw] ? filterRaw : "";
  const { user } = await requireUserContext();
  requirePermission(user, "medical_equipment.view");
  const canManage = hasPermission(user, "medical_equipment.manage");
  const supabase = await createClient();

  const [{ data: equipment, error }, departmentsRes] = await Promise.all([
    supabase
      .from("medical_equipment")
      .select("id,sequence_no,equipment_name,model_code,manufacturer,origin_country,year_manufactured,year_in_use,machine_code,registration_number,contract_from,contract_to,valid_from,department_id,department_label,notes,status,risk_classification")
      .eq("organization_id", user.organizationId)
      .order("sequence_no", { ascending: true, nullsFirst: false })
      .order("equipment_name", { ascending: true }),
    supabase.from("departments").select("id,name").eq("organization_id", user.organizationId).eq("is_active", true).order("name"),
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="QUẢN TRỊ"
        title="Quản lý TTBYT"
        description="Sổ theo dõi trang thiết bị y tế: hãng sản xuất, năm SX/SD, mã máy, số lưu hành, hạn hợp đồng/hiệu lực và khoa sử dụng."
        icon="network"
      />
      <NavGroupBar group="medical-equipment" active="/medical-equipment" ariaLabel="Thiết bị cần xử lý" emptyText="Không có thiết bị nào đang bảo trì / sửa chữa." />
      {filter ? <div className="scope-note">Đang lọc: <strong>{FILTER_LABEL[filter]}</strong> · <Link className="table-link" href="/medical-equipment">Bỏ lọc</Link></div> : null}
      {error ? <div className="alert error">Không tải được danh sách thiết bị: {error.message}</div> : null}
      <MedicalEquipmentClient onlyStatus={filter === "maintenance" ? "MAINTENANCE" : undefined} initialEquipment={(equipment ?? []) as any[]} departments={(departmentsRes.data ?? []) as any[]} canManage={canManage} />
    </div>
  );
}
