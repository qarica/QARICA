import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression found via a systematic sweep: qlvb-theme.css's mobile rule
// `.dashboard-page tbody tr{border-left:4px solid var(--accent-info)}` (and
// its :has(.status-badge.X) color variants) was written to give /dashboard's
// "Điểm nóng cần chú ý" table rows the same semantic left-border accent that
// /plans already gets on mobile (comment: "Mobile list cards in major
// modules use the same semantic left-border language"). It never fired: the
// dashboard page's root div used className "qcc-dashboard", never
// "dashboard-page", so the selector matched nothing and the table silently
// lost this visual-consistency treatment on mobile ever since.
describe("Dashboard page carries the 'dashboard-page' class an existing mobile CSS rule already targets", () => {
  it("/dashboard's root wrapper includes dashboard-page alongside its own qcc-dashboard class", () => {
    const page = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
    expect(page).toContain('<div className="page-stack qcc-dashboard dashboard-page">');
  });

  it("the mobile rule this unblocks actually targets a real table with status badges (Điểm nóng cần chú ý)", () => {
    const page = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
    expect(page).toContain("Điểm nóng cần chú ý");
    expect(page).toContain('<span className={`status-badge ${x.tone==="red"?"danger":"warning"}`}>');
  });

  it("qlvb-theme.css's dashboard-page rule is still there to receive it (not removed/renamed since)", () => {
    const theme = readFileSync("src/app/qlvb-theme.css", "utf8");
    expect(theme).toContain(".dashboard-page tbody tr,");
    expect(theme).toContain(".dashboard-page tbody tr:has(.status-badge.danger),");
  });
});
