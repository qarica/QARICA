import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for a screenshot report: "Tổng hợp 5S toàn viện" (/monitoring/
// 5s-tong-hop) on mobile showed "Xu hướng lượt giám sát 5S 12 tháng" and
// "Kết quả chung" squeezed into 2 cramped columns, with the TqmDonut visibly
// clipped off the right edge of the screen.
//
// Root cause: .tqm-grid is used in 2 places. /monitoring/page.tsx scopes its
// own @900px collapse rule (`.monitoring-workspace .tqm-grid{grid-template-
// columns:1fr}`), so it was fine. /monitoring/5s-tong-hop/page.tsx instead
// sets the split via an INLINE style={{gridTemplateColumns:"1.2fr .8fr"}} on
// the very same element — inline styles always beat external stylesheet
// rules regardless of specificity or media query, so that page never
// collapsed to 1 column at any viewport width, squeezing the fixed-size
// (170-190px) donut SVG into an ever-narrower .8fr track until it overflowed.
//
// Fix: add .tqm-grid to the existing mobile-responsive-fixes.css !important
// safety net (same mechanism already used for .legacy-grid3, which the file's
// own comment already flagged as suffering this exact inline-style problem) —
// a stylesheet !important rule is the only thing that can override an inline
// style without touching the page component itself.
describe("Mobile — .tqm-grid (5s-tong-hop's hard-coded inline-style grid) collapses to 1 column like every other dashboard grid", () => {
  const css = readFileSync("src/app/mobile-responsive-fixes.css", "utf8");
  const page = readFileSync("src/app/(app)/monitoring/5s-tong-hop/page.tsx", "utf8");

  it("5s-tong-hop's .tqm-grid still carries the hard-coded inline 1.2fr/.8fr split (confirms only a stylesheet !important rule can override it)", () => {
    expect(page).toContain('className="tqm-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 14 }}');
  });

  it(".tqm-grid is included in the shared !important mobile reflow rule alongside .legacy-grid3 and the other hard-coded grids", () => {
    expect(css).toContain(".workspace-app .legacy-grid3,\n  .workspace-app .tqm-grid,");
    expect(css).toContain(".workspace-app .legacy-grid3 > *,\n  .workspace-app .tqm-grid > *,");
  });
});
