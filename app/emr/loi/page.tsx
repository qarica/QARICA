import { emrSupabase } from "@/lib/emr/supabase";
import DataTable from "@/components/emr/DataTable";
import StatusPill from "@/components/emr/StatusPill";

export const revalidate = 0;

interface IssueRow {
  id: string;
  category: string | null;
  description: string;
  status: string;
  reported_at: string;
  emr_forms: { name: string } | null;
}

export default async function LoiPage() {
  const supabase = emrSupabase();
  const { data, error } = await supabase
    .from("emr_form_issues")
    .select("id, category, description, status, reported_at, emr_forms ( name )")
    .order("reported_at", { ascending: false });

  if (error) return <p className="text-sm text-red-600">Lỗi tải dữ liệu: {error.message}</p>;

  const rows = ((data as unknown as IssueRow[]) ?? []);
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      emptyLabel="Chưa ghi nhận lỗi/góp ý nào."
      columns={[
        { header: "Biểu mẫu", cell: (r) => r.emr_forms?.name ?? "—" },
        { header: "Nhóm lỗi", cell: (r) => r.category ?? "—" },
        { header: "Mô tả", cell: (r) => r.description },
        { header: "Trạng thái", cell: (r) => <StatusPill status={r.status} /> },
        {
          header: "Ngày ghi nhận",
          cell: (r) => new Date(r.reported_at).toLocaleDateString("vi-VN"),
        },
      ]}
    />
  );
}
