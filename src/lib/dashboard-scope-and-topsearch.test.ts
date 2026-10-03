import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression: the Dashboard's non-interactive "Phạm vi được phân công"
// placeholder (shown to non-hospital-scope users with no department name,
// styled to look like a button but with pointer-events:none — not usable)
// must be removed, not just relabeled, while the functional department
// <select> for hospital-scope users stays intact.
describe("Dashboard scope controls — removed the non-functional 'Phạm vi được phân công' placeholder", () => {
  const dashboard = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");

  it("no longer renders the inert placeholder span for non-hospital-scope users", () => {
    expect(dashboard).not.toContain("Phạm vi được phân công");
    expect(dashboard).not.toContain('style={{ pointerEvents: "none" }}');
  });

  it("keeps the functional department <select> for hospital-scope users untouched", () => {
    expect(dashboard).toContain('{isHospitalScope ? <select name="dept"');
    expect(dashboard).toContain(": null}");
  });

  it("still has exactly 3 scope controls left (from-date, asOf-date, Áp dụng) for the single-row layout", () => {
    expect(dashboard).toContain('<input type="date" name="from"');
    expect(dashboard).toContain('<input type="date" name="asOf"');
    expect(dashboard).toContain('<button type="submit" className="button primary">Áp dụng</button>');
  });
});

// Regression: the global TopSearchBox (Ctrl+K search over sự cố/RCA/CAPA/
// audit/tài liệu) was reported as not usable (no results ever appear) and
// the user asked to hide it. Removed from the shared topbar entirely rather
// than leaving a broken-looking control on every page.
describe("Topbar — removed the non-functional global TopSearchBox", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");

  it("no longer imports or renders TopSearchBox in the topbar", () => {
    expect(shell).not.toContain("TopSearchBox");
  });

  it("keeps the rest of the topbar-left brand block intact", () => {
    expect(shell).toContain('<span className="qarica-header-divider" aria-hidden="true"/></div></div>');
  });
});
