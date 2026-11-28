// Một nguồn tính duy nhất cho các tín hiệu ưu tiên hiển thị ở CẢ hai khối trên Dashboard:
// "Ưu tiên điều hành hôm nay" (TqmPriorityBoard) và "Ưu tiên hệ thống đề xuất" (TqmSmartCommandCenter).
// Trước đây mỗi khối tự viết điều kiện riêng nên lệch nhau (CAPA đã đóng vẫn bị Dashboard đếm là "cần đánh giá",
// sự cố REJECTED vẫn bị Smart đếm là "nghiêm trọng đang mở", ranh giới hạn "<" và "<=" khác nhau).
// Hàm thuần: chỉ nhận các dòng đã được lọc phạm vi (năm công tác + khoa/phòng) và ngày hôm nay (YYYY-MM-DD, giờ VN).

type Row = Record<string, unknown>;

const status = (row: Row) => String(row.workflow_status ?? "").toUpperCase();
const day = (value: unknown) => (value ? String(value).slice(0, 10) : "");

/** Quá hạn = ngày hạn đã qua (nhỏ hơn hôm nay). Đến hạn đúng hôm nay chưa tính là quá hạn. */
export function isPastDue(value: unknown, today: string) {
  const d = day(value);
  return !!d && d < today;
}

export const INCIDENT_CLOSED = new Set(["CLOSED", "CANCELLED", "REJECTED"]);
export const FINDING_CLOSED = new Set(["CLOSED", "CANCELLED"]);
export const CAPA_CLOSED = new Set(["CLOSED", "CANCELLED", "EFFECTIVE"]);
export const ACTION_DONE = new Set(["COMPLETED", "CANCELLED", "NOT_APPLICABLE"]);

/** Sự cố nghiêm trọng đang mở: có cờ sự cố nghiêm trọng, chưa đóng / hủy / bị từ chối. */
export function countSeriousOpenIncidents(incidents: Row[]) {
  return incidents.filter((x) => Boolean(x.serious_event_flag) && !INCIDENT_CLOSED.has(status(x))).length;
}

/** Finding quá hạn: chưa đóng/hủy và hạn xử lý đã qua. */
export function countOverdueFindings(findings: Row[], today: string) {
  return findings.filter((x) => !FINDING_CLOSED.has(status(x)) && isPastDue(x.due_date, today)).length;
}

/** CAPA cần đánh giá hiệu lực: chưa đóng/hủy/đã có hiệu lực, và đang ở bước đánh giá hoặc hạn đánh giá đã qua. */
export function countCapaEffectivenessDue(capas: Row[], today: string) {
  return capas.filter((x) => !CAPA_CLOSED.has(status(x)) && (status(x) === "EFFECTIVENESS_REVIEW" || isPastDue(x.effectiveness_due_date, today))).length;
}

/** Kỳ chỉ số ngoài mục tiêu: chỉ tính kỳ đã VERIFIED/LOCKED. */
export function countOutOfTargetIndicators(measurements: Row[]) {
  return measurements.filter((x) => ["VERIFIED", "LOCKED"].includes(status(x)) && String(x.result_level ?? "").toUpperCase() === "OUT_OF_TARGET").length;
}

/** Action kế hoạch quá hạn: tổng overdue_actions của vw_program_progress (chỉ Action thuộc kế hoạch). */
export function sumOverduePlanActions(plans: Row[]) {
  return plans.reduce((sum, x) => sum + Number(x.overdue_actions || 0), 0);
}

/** Toàn bộ Action quá hạn (mọi nguồn: kế hoạch, sự cố, Finding, CAPA, chỉ đạo...) từ vw_actions_dashboard. */
export function countOverdueActions(actions: Row[], today: string) {
  return actions.filter((x) => !ACTION_DONE.has(status(x)) && (Boolean(x.is_overdue) || isPastDue(x.due_date, today))).length;
}
