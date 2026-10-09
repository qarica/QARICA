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
// .page-header-main used to only render when the `icon` prop was set, so
// every RegistryModulePage config without an icon (indicators, fmea,
// directives, findings, inspections, reports) rendered a bare, unwrapped
// copy div with none of the width/min-width safety net below — PageHeader
// must always wrap in .page-header-main regardless of icon.
describe("PageHeader — .page-header-main gets the same mobile width/wrap safety net as .page-actions", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const component = readFileSync("src/components/page-header.tsx", "utf8");

  it("the copy div (eyebrow/h1/p) inside .page-header-main can shrink and wrap instead of forcing the row wider than its container", () => {
    expect(css).toContain(".page-header-main{display:flex;align-items:center;gap:14px}.page-header-main>div{min-width:0}");
  });

  it("at the ≤620px breakpoint (where .page-header becomes a flex column with align-items:flex-start), .page-header-main is forced to the column's full width instead of its own content width", () => {
    expect(css).toContain(".page-header-main,.page-actions{width:100%}");
  });

  it("PageHeader always wraps eyebrow/h1/p in .page-header-main, even when icon is absent (indicators, fmea, directives, findings, inspections, reports all omit it)", () => {
    expect(component).toMatch(/<div className="page-header-main">/);
    expect(component).not.toMatch(/\{icon\s*\?\s*<div className="page-header-main">/);
  });
});
