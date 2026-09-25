import { emrSupabase } from "../../../lib/emr/supabase";
import DataTable from "../../../components/emr/DataTable";
import StatusPill from "../../../components/emr/StatusPill";
import type { EmrProcess } from "../../../lib/emr/types";

export const revalidate = 0;

export default async function QuyTrinhPage() {
  const supabase = emrSupabase();
  const { data, error } = await supabase
    .from("emr_processes")
    .select("*")
    .order("status")
    .order("name");

  if (error) return <p className="text-sm text-red-600">Lỗi tải dữ liệu: {error.message}</p>;

  const rows = (data as EmrProcess[]) ?? [];
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        { header: "Tên tài liệu / quy trình", cell: (r) => r.name },
        { header: "Khoa/phòng chủ trì", cell: (r) => r.department ?? "—" },
        { header: "Trạng thái", cell: (r) => <StatusPill status={r.status} /> },
        { header: "Hạn chót", cell: (r) => r.deadline ?? "—" },
        { header: "Ghi chú", cell: (r) => r.notes ?? "—" },
      ]}
    />
  );
}
