import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phát hiện qua ảnh chụp người dùng: 3 tab "Tiếp nhận/Phân công/Theo dõi xử lý"
// ở trang Công văn đến dùng màu xanh (#123c66) và màu chữ/viền riêng, lệch
// khỏi token --qf-blue/--qf-line/--qf-muted mà chính final-visual-lock.css đã
// khai báo, cộng thêm không có font-size riêng (ăn theo 14px body) trong khi
// .tabs button cùng file dùng 12px. Khoá lại: dùng đúng token + 12px.
describe("final-visual-lock.css: .doc-view-tabs dùng đúng token màu + cỡ chữ chuẩn (không lệch riêng)", () => {
  it("không còn hardcode #123c66/#dce5ee/#475569 cho doc-view-tabs", () => {
    const source = read("src/app/final-visual-lock.css");
    expect(source).not.toContain(".incoming-doc-overview .doc-view-tabs button{border:1px solid #dce5ee");
    expect(source).not.toContain(".incoming-doc-overview .doc-view-tabs button.active{background:#123c66");
  });

  it("dùng var(--qf-blue)/var(--qf-line)/var(--qf-muted) và font-size:12px", () => {
    const source = read("src/app/final-visual-lock.css");
    expect(source).toContain(".incoming-doc-overview .doc-view-tabs button{border:1px solid var(--qf-line);border-radius:999px;background:#fff;padding:9px 13px;white-space:nowrap;color:var(--qf-muted);font-weight:700;font-size:12px;cursor:pointer}");
    expect(source).toContain(".incoming-doc-overview .doc-view-tabs button.active{background:var(--qf-blue);color:white;border-color:var(--qf-blue)}");
  });
});
