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

// Follow-up report after the fix above: "Vẫn lỗi chỉ thấy nửa màn hình trên
// mobile" with screenshots of Tổng quan EMR, Chỉ số chất lượng and Gantt
// tiến độ all showing the title/description/tab strip cut off at the right
// edge. overflow-x:hidden above stopped the whole-page zoom-out workaround,
// which means content that is genuinely wider than the viewport is now
// clipped instead of shrunk — exposing two real, previously-masked bugs
// (confirmed by loading the actual markup+CSS in a headless browser at a
// 390px mobile viewport and measuring document.body.scrollWidth):
//
// 1) EmrCommandCenter's `.emr-command{display:grid}` has NO
//    grid-template-columns, so its direct children (the title block, the
//    date-filter form, EmrWorkspaceNav, every KPI/chart section) default to
//    min-width:auto as grid items and refuse to shrink below their natural
//    (unwrapped) content width — on a 390px phone the title block alone
//    measured 568px wide and the page literally rendered 582px into a
//    390px viewport, with the excess silently clipped by overflow-x:hidden.
//
// 2) The shared module tab strip (.workspace-strip-inner, used by every
//    module with more than one workspace tab — Kế hoạch/Lịch QLCL/Chỉ đạo
//    & Yêu cầu, Đo lường chất lượng, etc.) has two CSS files fighting over
//    .workspace-context on mobile: workspace-shell.css's own
//    @media(max-width:760px) sets it to width:100% (written for a
//    flex-wrap:wrap layout where the context sits on its own row), but
//    mobile-responsive-fixes.css (loaded later) turns the strip into a
//    single flex-wrap:nowrap horizontally-scrollable row instead — so the
//    100% width survives unopposed and the context label (eyebrow+title)
//    alone claims the entire row before any tab is even reachable, which
//    is exactly "Kế hoạch / Lịch QLCL / Chỉ đạo-Yêu cầu / Nghỉ[...]" being
//    cut off with "large empty space" in the Gantt tiến độ screenshot.
describe("Mobile — EmrCommandCenter's grid no longer lets a child blow out past the viewport", () => {
  const client = readFileSync("src/components/emr-command-center.tsx", "utf8");

  it("every direct child of the .emr-command grid gets min-width:0 so it can shrink/wrap instead of overflowing", () => {
    expect(client).toContain(".emr-command{display:grid;isolation:isolate;gap:14px;color:#102a56}.emr-command>*{min-width:0}");
  });
});

describe("Mobile — workspace-strip's context label no longer claims the whole row and pushes every tab off-screen", () => {
  const css = readFileSync("src/app/mobile-responsive-fixes.css", "utf8");

  it("resets .workspace-context back to its natural (auto) width under the nowrap/scrollable mobile strip", () => {
    expect(css).toContain(".workspace-app .workspace-context {");
    expect(css).toMatch(/\.workspace-app \.workspace-context \{\s*flex: 0 0 auto !important;\s*width: auto !important;\s*max-width: 60% !important;\s*\}/);
  });
});
