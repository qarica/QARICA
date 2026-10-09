import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Defensive hardening found while investigating a report of /indicators'
// description paragraph ("Theo dõi chỉ số, kỳ đo, trạng thái dữ liệu và các
// hồ sơ đo lường trong năm.") appearing cut off at the right edge on mobile.
//
// PageHeader (src/components/page-header.tsx) renders .page-header-main as a
// flex row (icon + a copy div holding eyebrow/h1/p) with no min-width:0 on
// the copy div, and at the ≤620px breakpoint .page-header switches to
// flex-direction:column with align-items:flex-start — which means
// .page-header-main is NOT stretched to the column's full width, so it (and
// the text inside it) is only constrained by its own content's natural
// size instead of the viewport. .page-actions already got width:100% in
// mobile-responsive-fixes.css; .page-header-main had no equivalent anywhere.
//
// Verified in isolation (Playwright, 320–390px) that the exact text/classes
// from this page already wrap without overflow with these rules in place —
// this hardens that one shared component against the same class of bug
// regardless of what the live-reported cause turns out to be.
describe("PageHeader — .page-header-main gets the same mobile width/wrap safety net as .page-actions", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("the copy div (eyebrow/h1/p) inside .page-header-main can shrink and wrap instead of forcing the row wider than its container", () => {
    expect(css).toContain(".page-header-main{display:flex;align-items:center;gap:14px}.page-header-main>div{min-width:0}");
  });

  it("at the ≤620px breakpoint (where .page-header becomes a flex column with align-items:flex-start), .page-header-main is forced to the column's full width instead of its own content width", () => {
    expect(css).toContain(".page-header-main,.page-actions{width:100%}");
  });
});
