import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Báo cáo thực tế (ảnh chụp /calendar, khung "Việc của tôi" → chú giải bên
// phải): mọi loại mốc (Action, Nhắc việc cá nhân, Kế hoạch, Báo cáo, Giám
// sát, Tiếp đoàn, Sổ tay QLCL, Dự án EMR) đều có chấm tròn màu đứng trước
// tên, riêng "Đánh giá" (ASSESSMENT) không có chấm tròn nào — vì
// .calendar-dot.assessment chưa từng được định nghĩa trong CSS (ASSESSMENT
// có mặt trong KIND_LABEL nhưng không có rule màu tương ứng ở cả 3 nơi
// .calendar-dot/.calendar-event/.calendar-agenda-item, khác với mọi kind
// còn lại), nên <i className="calendar-dot assessment"> không có background
// → vô hình trên nền trắng.
describe("Calendar (/calendar) — chấm tròn chú giải của \"Đánh giá\" (ASSESSMENT)", () => {
  const source = readFileSync("src/app/(app)/calendar/page.tsx", "utf8");

  it("ASSESSMENT có mặt trong KIND_LABEL", () => {
    expect(source).toContain('ASSESSMENT: "Đánh giá"');
  });

  it(".calendar-dot.assessment có màu nền riêng, không còn vô hình", () => {
    expect(source).toMatch(/\.calendar-dot\.assessment\{background:#[0-9a-f]{6}\}/);
  });

  it(".calendar-event.assessment và .calendar-agenda-item.assessment cũng có màu riêng, khớp đủ bộ 3 nơi như mọi kind khác (program/monitoring/report/inspection/recurring/reminder/emr)", () => {
    expect(source).toMatch(/\.calendar-event\.assessment\{border-left-color:#[0-9a-f]{6}/);
    expect(source).toMatch(/\.calendar-agenda-item\.assessment\{border-left-color:#[0-9a-f]{6}/);
  });
});
