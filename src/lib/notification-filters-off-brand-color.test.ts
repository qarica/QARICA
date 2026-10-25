import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Rà soát toàn app các menu/tab lọc tương tự "doc-view-tabs" (đã sửa màu lệch
// #123c66 ở Công văn đến) — phát hiện thêm .notification-filters (menu "Lọc
// thông báo": Tất cả/Chưa đọc/Ưu tiên) dùng xanh lá/teal (#dff4ef/#0f655f) cho
// trạng thái active thay vì xanh thương hiệu (--brand) như mọi menu lọc khác
// trong app (gqc-tabs, pw-tab, recurring-cadence-tab, work-tab, calendar-kind-
// filter, range-toggle...). Khoá lại để không lặp lại kiểu lệch này.
describe("notification-bell.tsx: menu Lọc thông báo dùng đúng màu thương hiệu, không còn xanh lá/teal lạc tông", () => {
  it("không còn hardcode #dff4ef/#b8ded7/#0f655f hay #e6eef8/#1d3f73", () => {
    const source = read("src/components/notification-bell.tsx");
    expect(source).not.toContain("background:#dff4ef");
    expect(source).not.toContain("color:#0f655f");
    expect(source).not.toContain("background:#e6eef8");
    expect(source).not.toContain("color:#1d3f73");
  });

  it("dùng var(--brand-soft)/var(--brand-dark) cho hover và active", () => {
    const source = read("src/components/notification-bell.tsx");
    expect(source).toContain(".notification-filters button:hover{background:var(--brand-soft,#EEF2FF);color:var(--brand-dark,#172554)}");
    expect(source).toContain(".notification-filters button.active{background:var(--brand-soft,#EEF2FF);border-color:#C7D2FE;color:var(--brand-dark,#172554);font-weight:800}");
  });
});
