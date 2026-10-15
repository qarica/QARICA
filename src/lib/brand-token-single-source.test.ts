import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Real finding from a full-app UI/UX review: 3 "redesign" stylesheets
// (workspace-shell.css, qarica-design-system.css, qms-enterprise-
// redesign.css) each redefined --brand/--brand-dark/--brand-soft on
// .workspace-app with !important, pointing to 3 different color sets. Since
// all 3 tie on specificity+importance, the live color silently depended on
// <link> load order in layout.tsx (qms-enterprise-redesign.css loaded last,
// so it won). Worse: app-shell.tsx sets --brand via an INLINE style for
// per-organization custom branding (organization.primary_color) — inline
// styles beat any non-!important stylesheet rule, but these 3 !important
// rules beat the inline style regardless, so the per-org custom color
// feature silently never took effect. Fixed by making globals.css the sole
// --brand* source and updating app-shell.tsx's JS default to match it — the
// per-org custom color now actually applies.
//
// A 4th, previously-undetected source of the exact same bug class was found
// during the 2026-10-15 theme refresh (explicit request to redo the app's
// colors — "lộn xộn/nghiệp dư"): qlvb-theme.css ALSO redeclared
// --brand/--brand-dark/--brand-soft (plus --bg/--surface/--text/--muted/
// --line/--info/--info-soft/--shadow) in a plain, non-!important :root
// block — but a later-loaded plain declaration still wins the cascade by
// source order alone, so it silently out-ranked globals.css's "sole source
// of truth" anyway. The earlier fix's test only grepped for the
// `!important` pattern, so it never caught this. Removed from qlvb-theme.css
// entirely (its unique --accent-* tokens stay); its own component rules
// that directly hardcoded the old blue (not via a variable) were updated to
// the new navy to match.
describe("brand color token (--brand/--brand-dark/--brand-soft) has one source of truth", () => {
  it("globals.css defines the live brand values non-conditionally", () => {
    const globals = read("src/app/globals.css");
    expect(globals).toContain("--brand:#1E3A8A;--brand-dark:#172554;--brand-soft:#EEF2FF;");
  });

  it("the 3 former !important-competing stylesheets no longer redeclare --brand*", () => {
    for (const path of ["src/app/workspace-shell.css", "src/app/qarica-design-system.css", "src/app/qms-enterprise-redesign.css"]) {
      const source = read(path);
      expect(source).not.toMatch(/--brand:[^;]*!important/);
      expect(source).not.toMatch(/--brand-dark:[^;]*!important/);
      expect(source).not.toMatch(/--brand-soft:[^;]*!important/);
    }
  });

  it("qlvb-theme.css no longer redeclares --brand*/--bg/--surface/--text/--muted/--line/--info*/--shadow at all (a plain, non-!important :root block still wins the cascade by load order — the !important-only check above would miss this)", () => {
    const source = read("src/app/qlvb-theme.css");
    for (const name of ["--brand", "--brand-dark", "--brand-soft", "--bg", "--surface", "--text", "--muted", "--line", "--info", "--info-soft", "--shadow"]) {
      expect(source).not.toContain(`${name}:`);
    }
    expect(source).toContain("--accent-info:#1E3A8A;");
  });

  it("app-shell.tsx's inline per-org brand default matches globals.css (so it now actually takes effect with no visible color change)", () => {
    const source = read("src/components/app-shell.tsx");
    expect(source).toContain('organization?.primary_color || "#1E3A8A"');
  });
});
