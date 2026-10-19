import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Phát hiện từ rà soát UI/UX: tab lọc chu kỳ ở trang Recurring (Sổ tay
// QLCL) dùng CSS riêng cho .recurring-cadence-tab thay vì class dùng chung
// .work-tabs, khiến trạng thái active lệch quy ước so với tab lọc cùng vai
// trò (pill-shape + số đếm) ở /tasks (.work-tab.active: nền navy đặc, chữ
// trắng). Hài hòa màu active theo đúng quy ước đó mà không đổi cấu trúc
// component (tránh rủi ro lỗi styled-jsx scoping qua helper function).
describe("Recurring (Sổ tay QLCL) — tab lọc chu kỳ dùng màu active đồng bộ với .work-tab", () => {
  const source = readFileSync("src/components/recurring-work-client.tsx", "utf8");

  it(".recurring-cadence-tab.active tô nền navy đặc + chữ trắng, khớp quy ước .work-tab.active ở /tasks", () => {
    expect(source).toContain(".recurring-cadence-tab.active{border-color:#1E3A8A;background:#1E3A8A;color:#fff}");
  });
});
