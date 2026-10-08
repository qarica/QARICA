const DAY_MS = 86400000;

// Thời hạn đăng ký hành nghề (Tổ Hành chính):
// - Luân chuyển site nội bộ: phải đăng ký xong TRƯỚC ngày hiệu lực tối thiểu 10 ngày.
// - Giám đốc TT/Trưởng khoa (GDTT_TK), nhân sự mới: trong vòng 2 tuần kể từ ngày hiệu lực.
// - Bác sĩ (BS), nhân sự mới: tối đa 2 tháng (60 ngày) kể từ ngày hiệu lực.
//
// Dùng chung cho cả tạo mới (POST) và sửa (PATCH action UPDATE) — 1 nguồn duy
// nhất cho công thức tính hạn, tránh lệch nhau giữa 2 route.
export function computeDeadline(effectiveDate: string, roleType: string, caseType: string) {
  const base = new Date(`${effectiveDate}T00:00:00Z`);
  if (caseType === "INTERNAL_TRANSFER") return new Date(base.getTime() - 10 * DAY_MS).toISOString().slice(0, 10);
  const days = roleType === "GDTT_TK" ? 14 : 60;
  return new Date(base.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}
