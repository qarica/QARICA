// Eisenhower Matrix: phân loại ưu tiên thời gian theo 2 trục Quan trọng
// (importance) x Khẩn cấp (urgency) — dùng chung cho Việc cá nhân
// (personal-reminders.tsx) và module Kế hoạch công việc (work-plans).
// KHÔNG lưu quadrant làm cột riêng ở nơi tính từ priority/due_date có sẵn
// (personal_reminders) — tính (computed) để tránh lệch với priority/hạn xử
// lý khi 1 cái đổi mà quadrant quên cập nhật (một nghiệp vụ một nguồn sự
// thật). Ở work_plan_items (không có priority/due_date sẵn mang ý nghĩa
// tương đương) thì quadrant là lựa chọn trực tiếp của người dùng, không tính.
export const EISENHOWER_QUADRANTS = ["P1", "P2", "P3", "P4"] as const;
export type EisenhowerQuadrant = (typeof EISENHOWER_QUADRANTS)[number];

export const EISENHOWER_LABEL: Record<EisenhowerQuadrant, string> = {
  P1: "Quan trọng & Khẩn cấp",
  P2: "Quan trọng & Không khẩn cấp",
  P3: "Không quan trọng & Khẩn cấp",
  P4: "Không quan trọng & Không khẩn cấp",
};

export const EISENHOWER_ACTION: Record<EisenhowerQuadrant, string> = {
  P1: "Làm ngay",
  P2: "Lên lịch làm",
  P3: "Ủy thác / giao việc",
  P4: "Xóa bỏ",
};

export const EISENHOWER_TONE: Record<EisenhowerQuadrant, string> = {
  P1: "danger",
  P2: "info",
  P3: "warning",
  P4: "muted",
};

export function eisenhowerQuadrant(params: { important: boolean; urgent: boolean }): EisenhowerQuadrant {
  if (params.important && params.urgent) return "P1";
  if (params.important && !params.urgent) return "P2";
  if (!params.important && params.urgent) return "P3";
  return "P4";
}

// Việc cá nhân: quan trọng = priority HIGH/URGENT; khẩn cấp = đã quá hạn
// hoặc hạn rơi vào hôm nay (dateStr dạng YYYY-MM-DD, cùng quy ước dateOnly()
// đã dùng trong tasks/page.tsx — không parse lại bằng Date() mặc định).
export function personalReminderQuadrant(priority: string, dueDateOnly: string | null, todayDateOnly: string): EisenhowerQuadrant {
  const important = priority === "HIGH" || priority === "URGENT";
  const urgent = !!dueDateOnly && dueDateOnly <= todayDateOnly;
  return eisenhowerQuadrant({ important, urgent });
}
