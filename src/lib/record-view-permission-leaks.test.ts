import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Real finding from a full-app security review: "Trợ lý QLCL" (assistant)
// and "Hồ sơ đã hủy" (cancelled-records) both gate their page on the broad
// dashboard.view permission only, but then displayed Finding/CAPA/Risk/
// Feedback/... content (titles, due dates, cancellation reasons, owner
// names) that each has its OWN narrower view permission elsewhere (e.g.
// /risks requires risk.view/risk.manage). A user with only dashboard.view
// could read module content they have no entitlement to — a real
// cross-module data leak, not a hypothetical. Fixed by gating each
// record_type's content behind the exact same permission its own module
// page requires, via one shared source of truth (RECORD_VIEW_PERMISSIONS).
describe("cross-module permission leaks (Trợ lý QLCL, Hồ sơ đã hủy)", () => {
  it("RECORD_VIEW_PERMISSIONS matches the exact permission list each module's own page requires", () => {
    const map = read("src/lib/record-view-permissions.ts");
    expect(map).toContain('FINDING: ["findings.view", "findings.manage"]');
    expect(map).toContain('CAPA: ["capa.view", "capa.manage"]');
    expect(map).toContain('RISK: ["risk.view", "risk.manage"]');
    expect(map).toContain('REPORT: ["reports.view", "reports.manage"]');
    expect(map).toContain('DIRECTIVE: ["directives.view", "directives.manage"]');
    expect(map).toContain('INSPECTION: ["inspections.view", "inspections.manage"]');
    expect(map).toContain('FEEDBACK: ["feedback.view", "feedback.manage"]');
    expect(map).toContain('ACTION: ["tasks.view"]');

    // Cross-check a sample against the real gate each module page uses, so
    // this map can't silently drift from the pages it is meant to mirror.
    expect(read("src/app/(app)/risks/page.tsx")).toContain('hasAnyPermission(user,["risk.view","risk.manage"])');
    expect(read("src/app/(app)/capa/page.tsx")).toContain('hasAnyPermission(user,["capa.view","capa.manage"])');
    expect(read("src/app/(app)/tasks/page.tsx")).toContain('requirePermission(user,"tasks.view")');
  });

  it("Trợ lý QLCL (assistant) gates every category's data fetch behind its own record-type permission, not just dashboard.view", () => {
    const layout = read("src/app/(app)/assistant/layout.tsx");
    expect(layout).toContain('requirePermission(user, "dashboard.view")');
    const page = read("src/app/(app)/assistant/page.tsx");
    expect(page).toContain('canViewRecordType(user, "FINDING")');
    expect(page).toContain('canViewRecordType(user, "CAPA")');
    expect(page).toContain('canViewRecordType(user, "RISK")');
    expect(page).toContain('canViewRecordType(user, "REPORT")');
    expect(page).toContain('canViewRecordType(user, "DIRECTIVE")');
    expect(page).toContain('canViewRecordType(user, "INSPECTION")');
    expect(page).toContain('canViewRecordType(user, "INDICATOR_MEASUREMENT")');
    expect(page).toContain('canViewRecordType(user, "FEEDBACK")');
    expect(page).toContain('canViewRecordType(user, "MONITORING")');
    expect(page).toContain('canViewRecordType(user, "ACTION")');
    // Each category's query must actually be skipped (not just hidden in
    // render) when the user lacks that category's permission.
    expect(page).toContain("canSeeFindings ? supabase.from(\"findings\")");
    expect(page).toContain("canSeeCapa ? supabase.from(\"capas\")");
    expect(page).toContain("canSeeRisks ? supabase.from(\"risks\")");
  });

  it("Hồ sơ đã hủy (cancelled-records) filters every record by the caller's per-type view permission, not just dashboard.view", () => {
    const page = read("src/app/(app)/cancelled-records/page.tsx");
    expect(page).toContain('if (!user.permissions.includes("dashboard.view")) redirect("/dashboard?forbidden=1")');
    expect(page).toContain("canViewRecordType(user, row.record_type)");
    // The type-filter dropdown must not advertise types the caller cannot
    // actually see either.
    expect(page).toContain("visibleTypeLabels");
    expect(page).toContain("Object.entries(visibleTypeLabels).map");
  });
});
