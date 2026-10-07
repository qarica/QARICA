import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Real finding from a full-app UI/UX review: 3 "redesign" stylesheets
// (workspace-shell.css, qarica-design-system.css, qms-enterprise-
// redesign.css) each redefined --brand/--brand-dark/--brand-soft on
// .workspace-app with !important, pointing to 3 different color sets. Since
// all 3 tie on specificity+importance, the live color silently depended on
// <link> load order in layout.tsx (qms-enterprise-redesign.css loaded last,
// so it won — #0D6EFD). Worse: app-shell.tsx sets --brand via an INLINE
// style for per-organization custom branding (organization.primary_color) —
// inline styles beat any non-!important stylesheet rule, but these 3
// !important rules beat the inline style regardless, so the per-org custom
// color feature silently never took effect. Fixed by making globals.css the
// sole --brand* source (same value qms-enterprise-redesign.css used to win
// with, so no visible change) and updating app-shell.tsx's JS default to
// match it — now the per-org custom color actually applies.
describe("brand color token (--brand/--brand-dark/--brand-soft) has one source of truth", () => {
  it("globals.css defines the live brand values non-conditionally", () => {
    const globals = read("src/app/globals.css");
    expect(globals).toContain("--brand:#0D6EFD;--brand-dark:#0B5ED7;--brand-soft:#E7F1FF;");
  });

  it("the 3 former competing stylesheets no longer redeclare --brand*", () => {
    for (const path of ["src/app/workspace-shell.css", "src/app/qarica-design-system.css", "src/app/qms-enterprise-redesign.css"]) {
      const source = read(path);
      expect(source).not.toMatch(/--brand:[^;]*!important/);
      expect(source).not.toMatch(/--brand-dark:[^;]*!important/);
      expect(source).not.toMatch(/--brand-soft:[^;]*!important/);
    }
  });

  it("app-shell.tsx's inline per-org brand default matches globals.css (so it now actually takes effect with no visible color change)", () => {
    const source = read("src/components/app-shell.tsx");
    expect(source).toContain('organization?.primary_color || "#0D6EFD"');
  });
});
