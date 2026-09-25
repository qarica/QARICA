import { emrSupabase } from "../../../lib/emr/supabase";
import DataTable from "../../../components/emr/DataTable";
import StatusPill from "../../../components/emr/StatusPill";
import type { MedicalEquipment } from "../../../lib/emr/types";

export const revalidate = 0;

export default async function ThietBiYteePage() {
  const supabase = emrSupabase();
  const { data, error } = await supabase
    .from("emr_medical_equipment")
    .select("*")
    .order("department")
    .order("name");

  if (error) return <p className="text-sm text-red-600">Lỗi tải dữ liệu: {error.message}</p>;

  const rows = (data as MedicalEquipment[]) ?? [];
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        { header: "Thiết bị", cell: (r) => r.name },
        { header: "Model", cell: (r) => r.model ?? "—" },
        { header: "Khoa", cell: (r) => r.department ?? "—" },
        { header: "Định dạng ảnh", cell: (r) => r.image_format ?? "—" },
        { header: "Kết nối PACS/DICOM", cell: (r) => r.integration_method ?? "—" },
        { header: "Trạng thái", cell: (r) => <StatusPill status={r.status} /> },
      ]}
    />
  );
}
