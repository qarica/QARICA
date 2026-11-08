import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Real report (phone screenshot): the mobile page-title span next to the
// hamburger button ran visibly into/behind the year selector box — topbar-
// left never shrinks (flex:0 0 auto) and the year selector + icon row on
// the right also needs its full width, so on a narrow phone both don't fit
// on one row and the title text overlaps the year box instead of being
// clipped. The page title is already shown in the page body right below
// the topbar, so it's hidden here rather than reworked to coexist.
describe("Mobile topbar: page-title text no longer overlaps the year selector on narrow phones", () => {
  it("mobile-responsive-fixes.css hides .mobile-current-page under its 620px breakpoint (loads last, so this wins over app-shell.tsx's <760px rule that turns it on)", () => {
    const css = readFileSync("src/app/mobile-responsive-fixes.css", "utf8");
    const narrowBlockStart = css.indexOf("@media (max-width: 620px)");
    expect(narrowBlockStart).toBeGreaterThanOrEqual(0);
    const narrowBlockEnd = css.indexOf("@media (max-width: 480px)");
    const narrowBlock = css.slice(narrowBlockStart, narrowBlockEnd > narrowBlockStart ? narrowBlockEnd : undefined);
    expect(narrowBlock).toContain(".workspace-app .mobile-current-page {\n    display: none !important;\n  }");
  });
});

// Real report (phone screenshot): even with the page-title text hidden
// above, the year-selector box itself still visibly overlapped the
// hamburger/sidebar-toggle button on a narrow phone. Root cause: topbar-
// right holds ~6-7 fixed-width icons (year selector, calendar, inbox,
// notebook, modules, notification bell, profile) that together need more
// width than remains next to topbar-left (flex:0 0 auto, never shrinks);
// `.topbar-right > *{flex:0 0 auto}` stops any of them shrinking, so with
// the old justify-content:flex-end the overflow spilled to the LEFT —
// under topbar-left's own hamburger icon — instead of just running off
// past the visible area on the right. Fix: flex-start (year selector, the
// most-used one, stays the first icon right after the hamburger, always
// visible) + the row's own overflow-x:auto (profile/avatar etc., further
// right, scrolls into view instead of ever bleeding left into topbar-left)
// — makes the overlap structurally impossible regardless of exact icon
// count/width on any given phone, instead of fighting over a pixel budget.
describe("Mobile topbar: year-selector box no longer overlaps the hamburger/sidebar-toggle button on narrow phones", () => {
  it("topbar-right under the 860px breakpoint uses flex-start (not flex-end) + its own overflow-x:auto, so overflow scrolls right instead of bleeding left into topbar-left", () => {
    const css = readFileSync("src/app/mobile-responsive-fixes.css", "utf8");
    const block860Start = css.indexOf("@media (max-width: 860px)");
    const block860End = css.indexOf("@media (max-width: 620px)");
    const block860 = css.slice(block860Start, block860End);
    expect(block860).toContain(".workspace-app .topbar-right {");
    expect(block860).toContain("justify-content: flex-start !important;");
    expect(block860).not.toContain("justify-content: flex-end !important;");
    expect(block860).toContain("overflow-x: auto !important;");
    expect(block860).toContain(".workspace-app .topbar-right::-webkit-scrollbar {");
    expect(block860).toContain("display: none !important;");
    // topbar-right's icons must still refuse to shrink (so they scroll at
    // full size instead of squeezing unreadably small).
    expect(block860).toContain(".workspace-app .topbar-right > * {\n    flex: 0 0 auto !important;\n  }");
  });
});
