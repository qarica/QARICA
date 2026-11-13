import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// AlertStrip: dải thẻ cảnh báo nằm ngang (thay cho .alerts/.alert-row cũ là
// danh sách dọc trong 1 panel) — khớp bố cục "dải cảnh báo khẩn cấp" trong
// ảnh tham khảo. Dùng chung AlertStripItem từ quality-alert-strip.ts, không
// định nghĩa type trùng lặp.
describe("AlertStrip (src/components/alert-strip.tsx): dải thẻ cảnh báo ngang, dùng chung AlertStripItem", () => {
  const source = read("src/components/alert-strip.tsx");

  it("import type AlertStripItem từ quality-alert-strip.ts (không định nghĩa type trùng lặp)", () => {
    expect(source).toContain('import type { AlertStripItem } from "@/lib/quality-alert-strip";');
  });

  it("rỗng thì hiện empty-state, có emptyText tuỳ chỉnh", () => {
    expect(source).toContain("if (!items.length) return <div className=\"empty-state compact\">{emptyText ||");
  });

  it("mỗi item là Link bấm được tới href, có icon/tiêu đề/mô tả phụ theo đúng tone", () => {
    expect(source).toContain('<Link href={item.href} className={`alert-strip-card ${item.tone}`}');
    expect(source).toContain('<span className={`alert-strip-icon ${item.tone}`}>');
    expect(source).toContain("{item.sub ? <small>{item.sub}</small> : null}");
  });

  it("globals.css định nghĩa .alert-strip/.alert-strip-card/.alert-strip-icon 1 lần duy nhất, tái dùng token --tone-* đã có (không bịa màu mới)", () => {
    const css = read("src/app/globals.css");
    for (const cls of [".alert-strip{", ".alert-strip-card{", ".alert-strip-icon{", ".alert-strip-copy{"]) {
      expect(css.split(cls).length - 1, `${cls} should appear exactly once`).toBe(1);
    }
    expect(css).toContain(".alert-strip-card{display:flex;align-items:flex-start;gap:10px;background:#fff;border:1px solid var(--line);border-left:3px solid var(--tone-red)");
    expect(css).toContain(".alert-strip-icon.red{background:var(--tone-red-soft);color:var(--tone-red)}");
  });
});
