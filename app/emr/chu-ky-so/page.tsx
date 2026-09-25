import { emrSupabase } from "@/lib/emr/supabase";
import DataTable from "@/components/emr/DataTable";
import type { DigitalSignature } from "@/lib/emr/types";

export const revalidate = 0;

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

export default async function ChuKySoPage() {
  const supabase = emrSupabase();
  const { data, error } = await supabase
    .from("emr_digital_signatures")
    .select("*")
    .order("expires_at", { ascending: true, nullsFirst: false });

  if (error) return <p className="text-sm text-red-600">Lỗi tải dữ liệu: {error.message}</p>;

  const rows = (data as DigitalSignature[]) ?? [];
  const expiringSoon = rows.filter((r) => {
    const d = daysUntil(r.expires_at);
    return d !== null && d <= 30 && d >= 0;
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Bảng này chỉ theo dõi trạng thái chữ ký số — không lưu số CCCD/CMND.
      </p>
      {expiringSoon.length > 0 ? (
        <p className="text-xs text-amber-700">
          <b>{expiringSoon.length}</b> chữ ký số sắp hết hạn trong 30 ngày tới.
        </p>
      ) : null}
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { header: "Họ tên", cell: (r) => r.staff_name },
          { header: "Khoa/phòng", cell: (r) => r.department ?? "—" },
          { header: "Chức danh", cell: (r) => r.title ?? "—" },
          { header: "Đơn vị cung cấp", cell: (r) => r.provider ?? "—" },
          {
            header: "Hết hạn",
            cell: (r) => {
              const d = daysUntil(r.expires_at);
              if (!r.expires_at) return "—";
              const soon = d !== null && d <= 30 && d >= 0;
              return (
                <span className={soon ? "font-medium text-amber-700" : ""}>
                  {r.expires_at}
                  {soon ? ` (còn ${d} ngày)` : ""}
                </span>
              );
            },
          },
        ]}
      />
    </div>
  );
}
