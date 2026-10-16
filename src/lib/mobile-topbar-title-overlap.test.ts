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
