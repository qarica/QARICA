import ImportCsvPanel from "../../../components/emr/ImportCsvPanel";

export const metadata = { title: "Nhập liệu EMR | QARICA" };

export default function NhapLieuPage() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        Trang này nhập dữ liệu <b>trực tiếp từ trình duyệt của bạn vào Supabase</b> —
        không đi qua máy chủ nào khác. Dùng để nạp dữ liệu thật từ file Excel dự án
        (xuất CSV bằng <code className="rounded bg-white/70 px-1">scripts/export_excel_to_csv.py</code>),
        thay vì đưa dữ liệu thật vào mã nguồn/GitHub.
      </div>
      <ImportCsvPanel />
    </div>
  );
}
