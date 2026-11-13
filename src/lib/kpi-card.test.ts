import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// KpiCard: component dùng chung cho mọi trang thay vì mỗi trang tự chép tay
// JSX "<article className=kpi-card>" (23 file đã làm vậy, 2 tên class khác
// nhau kpi-card/kpi) — bắt đầu từ component mới, tránh đụng 23 file hiện có
// nên dùng class mới ".kpi-tile", không tái dùng ".kpi-card"/".kpi".
describe("KpiCard (src/components/kpi-card.tsx): component chung cho KPI, dùng class mới .kpi-tile", () => {
  const source = read("src/components/kpi-card.tsx");

  it("export KpiCard với đúng props: icon, tone, label, value, trend, visual, href", () => {
    expect(source).toContain("export function KpiCard({");
    expect(source).toContain("icon, tone = \"blue\", label, value, trend, visual, href,");
  });

  it("render className=\"kpi-tile\" (KHÔNG tái dùng kpi-card/kpi của 23 file cũ, tránh đụng CSS trang khác)", () => {
    expect(source).toContain('className="kpi-tile"');
    expect(source).not.toContain('className="kpi-card"');
  });

  it("icon dùng className=\"kpi-icon <tone>\" đúng quy ước đã có (kpi-icon-tone-coverage.test.ts áp dụng cho cả file này)", () => {
    expect(source).toContain('className={`kpi-icon ${tone}`}');
  });

  it("trend dùng className=\"kpi-trend <tone>\" với mũi tên lên/xuống", () => {
    expect(source).toContain('className={`kpi-trend ${trend.tone}`}');
    expect(source).toContain('trend.tone === "up" ? "▲" : trend.tone === "down" ? "▼" : ""');
  });

  it("visual là slot tuỳ chọn (TqmGauge/TqmDonut...), chỉ render khi có", () => {
    expect(source).toContain("{visual ? <div className=\"kpi-tile-visual\">{visual}</div> : null}");
  });

  it("có href thì bọc trong Link (card bấm được), không có thì render <article> tĩnh", () => {
    expect(source).toContain("import Link from \"next/link\";");
    expect(source).toContain("href\n    ? <Link href={href} className=\"kpi-tile kpi-tile-link\">{body}</Link>\n    : <article className=\"kpi-tile\">{body}</article>;");
  });

  it("globals.css định nghĩa .kpi-tile/.kpi-tile-top/.kpi-tile-value/.kpi-tile-visual/.kpi-tile-label 1 lần duy nhất", () => {
    const css = read("src/app/globals.css");
    for (const cls of [".kpi-tile{", ".kpi-tile-top{", ".kpi-tile-value{", ".kpi-tile-visual{", ".kpi-tile-label{"]) {
      expect(css.split(cls).length - 1, `${cls} should appear exactly once`).toBe(1);
    }
  });
});
