// Định dạng giờ quét QR điểm danh (procedure_training_attendees.checked_in_at, timestamptz lưu UTC)
// cho file Excel: "dd/MM/yyyy HH:mm" theo GIỜ VIỆT NAM (Asia/Ho_Chi_Minh, UTC+7) — không theo múi
// giờ máy chủ (Vercel chạy UTC nên toLocaleString mặc định sẽ lệch 7 giờ, qua nửa đêm còn lệch
// cả NGÀY). Hàm thuần để test được. Rỗng/không hợp lệ → "—" (người điểm danh thủ công hoặc nhập
// file không có giờ quét, cùng quy ước "—" với ô điểm trống).
export function formatCheckInTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}
