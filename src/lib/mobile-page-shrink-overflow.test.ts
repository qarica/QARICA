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
    expect(css).toMatch(/\.workspace-app \.workspace-context \{\s*flex: 0 0 auto !important;\s*width: auto !important;\s*max-width: 80vw !important;\s*\}/);
  });

  // Follow-up: a flat max-width % alone wasn't enough — on a longer module
  // title ("Đo lường chất lượng" vs "Điều hành QLCL") the context text still
  // wrapped inside that percentage, making the row tall and the vertically-
  // centered tabs look like a second, broken row below it (reported as
  // "Chỉ số chất lượng / Danh mục chỉ số..." still cut off even after the
  // width fix). The strip already scrolls horizontally, so the context never
  // needs to wrap at all — force it single-line instead.
  it("keeps the context eyebrow/title single-line so a long title can't make the row tall and shove the tabs below it", () => {
    expect(css).toMatch(/\.workspace-app \.workspace-context span,\s*\n\s*\.workspace-app \.workspace-context strong \{\s*white-space: nowrap !important;\s*\}/);
  });
});

// Follow-up: the Gantt tiến độ screenshot also showed calendar/layout.tsx's
// own secondary nav ("Lịch tổng hợp / Bộ lịch nền & nguồn / ...") rendering
// as a tall, sparsely-spaced single column instead of a compact 2-column
// grid — the exact same CSS Grid bug class just fixed in EmrCommandCenter:
// `grid-template-columns:1fr 1fr` (no minmax(0,...)) lets a track's
// automatic minimum content size win and push a column off-screen instead
// of shrinking/wrapping it.
describe("Mobile — calendar module nav grid can't blow out the same way EmrCommandCenter's did", () => {
  const layout = readFileSync("src/app/(app)/calendar/layout.tsx", "utf8");

  it("uses minmax(0,1fr) tracks instead of bare 1fr so a long label wraps inside its cell instead of overflowing", () => {
    expect(layout).toContain("grid-template-columns:repeat(2,minmax(0,1fr))");
  });
});
