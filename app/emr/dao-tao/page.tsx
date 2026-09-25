import { emrSupabase } from "@/lib/emr/supabase";
import DataTable from "@/components/emr/DataTable";
import StatusPill from "@/components/emr/StatusPill";
import type { TrainingSignoff } from "@/lib/emr/types";

export const revalidate = 0;

export default async function DaoTaoPage() {
  const supabase = emrSupabase();
  const { data, error } = await supabase
    .from("emr_training_signoff")
    .select("*")
    .order("department")
    .order("item_name");

  if (error) return <p className="text-sm text-red-600">Lỗi tải dữ liệu: {error.message}</p>;

  const rows = (data as TrainingSignoff[]) ?? [];
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        { header: "Khoa/phòng", cell: (r) => r.department },
        { header: "Nội dung đào tạo / bàn giao", cell: (r) => r.item_name ?? "—" },
        { header: "Trạng thái", cell: (r) => <StatusPill status={r.status} /> },
        { header: "Ghi chú", cell: (r) => r.notes ?? "—" },
      ]}
    />
  );
}
