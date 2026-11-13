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

  it("mỗi item là Link bấm được tới href; eyebrow (nhãn mức độ) + title + action link bên phải + sub — đúng bố cục ảnh tham khảo Oryvia (nhãn nhỏ phía trên, không khoanh icon tròn to)", () => {
    expect(source).toContain('<Link href={item.href} className="alert-strip-card"');
    expect(source).toContain('<span className={`alert-strip-eyebrow ${item.tone}`}>{item.eyebrow}</span>');
    expect(source).toContain('<span className="alert-strip-action">{item.actionText} →</span>');
    expect(source).toContain("{item.sub ? <span className=\"alert-strip-sub\">{item.sub}</span> : null}");
  });

  it("globals.css định nghĩa .alert-strip/.alert-strip-card/.alert-strip-eyebrow 1 lần duy nhất, tái dùng token --tone-* đã có (không bịa màu mới)", () => {
    const css = read("src/app/globals.css");
    for (const cls of [".alert-strip{", ".alert-strip-card{", ".alert-strip-eyebrow{", ".alert-strip-row{"]) {
      expect(css.split(cls).length - 1, `${cls} should appear exactly once`).toBe(1);
    }
    expect(css).toContain(".alert-strip-eyebrow.red{color:var(--tone-red)}");
  });
});
