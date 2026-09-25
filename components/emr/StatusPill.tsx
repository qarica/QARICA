// Badge trạng thái dùng chung cho toàn bộ module EMR Dashboard.
// Không cần "use client" — chỉ render tĩnh theo props.

const TONE: Record<string, string> = {
  // xanh — đã xong
  "Đã thực hiện EMR": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Đã hoàn thành": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Hoàn thành": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Đã ban hành": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Đã triển khai": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Đã thực hiện": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Đã sửa": "bg-emerald-50 text-emerald-700 border-emerald-200",

  // xanh dương — đang chạy
  "Đang triển khai": "bg-blue-50 text-blue-700 border-blue-200",
  "Đang thực hiện": "bg-blue-50 text-blue-700 border-blue-200",
  "Đang lấy ý kiến": "bg-blue-50 text-blue-700 border-blue-200",
  "Đang xử lý": "bg-blue-50 text-blue-700 border-blue-200",
  "Test": "bg-blue-50 text-blue-700 border-blue-200",

  // vàng — cần chú ý
  "Chờ xác nhận": "bg-amber-50 text-amber-700 border-amber-200",
  "Sửa lại": "bg-amber-50 text-amber-700 border-amber-200",
  "Mới": "bg-amber-50 text-amber-700 border-amber-200",
  "Dự thảo": "bg-amber-50 text-amber-700 border-amber-200",
  "Tạm hoãn": "bg-amber-50 text-amber-700 border-amber-200",

  // xám — chưa bắt đầu
  "Chưa triển khai": "bg-slate-100 text-slate-600 border-slate-200",
  "Chưa gán khoa": "bg-slate-100 text-slate-600 border-slate-200",
  "Chưa thực hiện": "bg-slate-100 text-slate-600 border-slate-200",
  "Chưa test": "bg-slate-100 text-slate-600 border-slate-200",
  "Không phải test": "bg-slate-100 text-slate-500 border-slate-200",
  "Chờ triển khai": "bg-slate-100 text-slate-600 border-slate-200",
};

export default function StatusPill({ status }: { status: string }) {
  const cls = TONE[status] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium " +
        cls
      }
    >
      {status}
    </span>
  );
}
