import { emrSupabase } from "../../../lib/emr/supabase";
import DataTable from "../../../components/emr/DataTable";
import type { ItEquipment } from "../../../lib/emr/types";

export const revalidate = 0;

export default async function ThietBiCntt() {
  const supabase = emrSupabase();
  const { data, error } = await supabase
    .from("emr_it_equipment")
    .select("*")
    .order("location")
    .order("device_name");

  if (error) return <p className="text-sm text-red-600">Lỗi tải dữ liệu: {error.message}</p>;

  const rows = (data as ItEquipment[]) ?? [];
  const totalGap = rows.reduce((sum, r) => sum + r.qty_needed, 0);

  return (
    <div className="space-y-3">
      {totalGap > 0 ? (
        <p className="text-xs text-amber-700">
          Tổng số thiết bị còn cần bổ sung: <b>{totalGap}</b>
        </p>
      ) : null}
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { header: "Thiết bị", cell: (r) => r.device_name },
          { header: "Vị trí", cell: (r) => r.location },
          { header: "Hiện có", cell: (r) => r.qty_available },
          {
            header: "Cần bổ sung",
            cell: (r) =>
              r.qty_needed > 0 ? (
                <span className="font-medium text-amber-700">{r.qty_needed}</span>
              ) : (
                <span className="text-slate-400">0</span>
              ),
          },
          { header: "Ghi chú", cell: (r) => r.notes ?? "—" },
        ]}
      />
    </div>
  );
}
