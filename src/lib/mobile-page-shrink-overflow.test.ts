import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for a real reported bug: "menu Tổng quan EMR, Gantt tiến độ
// trong Lịch QLCL, Chỉ số chất lượng bị lỗi giao diện web thu nhỏ trên
// mobile" — several unrelated pages rendered as if the whole site were
// zoomed out on mobile. Root cause: html/body had no `overflow-x:hidden`,
// so ANY descendant wider than the viewport (e.g. the Gantt's
// horizontally-scrollable grid, which has a min-width in the hundreds of
// px) could force the page's layout viewport wider, and mobile browsers
// auto-shrink the zoom level to fit that width — shrinking EVERY page in
// the same browsing session, not just the one with the wide element. Fixed
// once at the root instead of chasing every individual wide component.
describe("Mobile — page no longer zoom-shrinks when a descendant is wider than the viewport", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("html,body clips horizontal overflow globally", () => {
    expect(css).toContain("html,body{margin:0;min-height:100%;overflow-x:hidden;background:var(--bg);color:var(--text)}");
  });
});
