// Cảnh báo xu hướng xấu dần cho một chỉ số/phân công: phát hiện khi kết quả đang
// đi đúng chiều "xấu hơn" trong nhiều kỳ liên tiếp gần nhất, NGAY CẢ KHI kỳ mới
// nhất vẫn còn MEETS_TARGET — mục tiêu là báo sớm trước khi thật sự vượt ngưỡng,
// không phải thay thế cảnh báo OUT_OF_TARGET đã có.
//
// Chỉ đánh giá cho chiều HIGHER_IS_BETTER / LOWER_IS_BETTER (có nghĩa rõ ràng thế
// nào là "xấu hơn"). TARGET_RANGE và NEUTRAL bị bỏ qua vì không đủ căn cứ suy ra
// hướng xấu từ 1 giá trị đơn lẻ.

export type DesiredDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER" | "TARGET_RANGE" | "NEUTRAL" | null | undefined;

export type TrendMeasurementLike = {
  period_end?: string | null;
  calculated_value?: number | string | null;
  workflow_status?: string | null;
};

export type DecliningTrendResult = {
  declining: boolean;
  /** Số kỳ liên tiếp xấu dần được xét (mặc định 3). Rỗng nếu không đủ dữ liệu. */
  periods: { period_end: string; value: number }[];
  reason?: "insufficient_data" | "direction_not_evaluable" | "not_declining";
};

const EVALUABLE_STATUS = new Set(["VERIFIED", "LOCKED"]);
const EVALUABLE_DIRECTIONS = new Set(["HIGHER_IS_BETTER", "LOWER_IS_BETTER"]);

/**
 * `rows` không cần sắp xếp trước; hàm tự lọc kỳ đã VERIFIED/LOCKED có giá trị số,
 * sắp theo period_end tăng dần, rồi xét `windowSize` kỳ gần nhất (mặc định 3).
 */
export function detectDecliningTrend(
  rows: TrendMeasurementLike[],
  direction: DesiredDirection,
  windowSize = 3,
): DecliningTrendResult {
  const dir = String(direction || "").toUpperCase();
  if (!EVALUABLE_DIRECTIONS.has(dir)) {
    return { declining: false, periods: [], reason: "direction_not_evaluable" };
  }

  const evaluable = rows
    .filter((r) => EVALUABLE_STATUS.has(String(r.workflow_status || "").toUpperCase()))
    .filter((r) => r.calculated_value !== null && r.calculated_value !== undefined && r.calculated_value !== "")
    .map((r) => ({ period_end: String(r.period_end || ""), value: Number(r.calculated_value) }))
    .filter((r) => r.period_end && Number.isFinite(r.value))
    .sort((a, b) => a.period_end.localeCompare(b.period_end));

  if (evaluable.length < windowSize) {
    return { declining: false, periods: [], reason: "insufficient_data" };
  }

  const window = evaluable.slice(-windowSize);
  let declining = true;
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1].value;
    const cur = window[i].value;
    const worse = dir === "HIGHER_IS_BETTER" ? cur < prev : cur > prev;
    if (!worse) {
      declining = false;
      break;
    }
  }

  return declining
    ? { declining: true, periods: window }
    : { declining: false, periods: window, reason: "not_declining" };
}
