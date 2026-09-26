import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p:string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("EMR security and control gates", () => {
  it("separates view and manage permissions at API boundaries", () => {
    expect(read("src/app/api/emr/dashboard/route.ts")).toContain('requireApiPermission("emr.view")');
    const items = read("src/app/api/emr/items/route.ts");
    expect(items).toContain('requireApiPermission("emr.view")');
    expect(items).toContain('requireApiPermission("emr.manage")');
    expect(read("src/app/api/emr/items/[id]/route.ts")).toContain('requireApiPermission("emr.manage")');
  });
  it("hides EMR navigation from users without emr.view", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('{ label: "Tổng quan EMR", href: "/emr", icon: "layout-dashboard", permission: "emr.view" }');
    expect(nav).toContain('permission: "emr.view"');
  });
  it("uses Vietnam-local calendar dates for deadline control", () => {
    const dashboard = read("src/app/api/emr/dashboard/route.ts");
    expect(dashboard).toContain('timeZone: "Asia/Ho_Chi_Minh"');
    expect(dashboard).toContain('x.due_date < today');
  });
  it("keeps dashboard and mutations tenant-scoped", () => {
    expect(read("src/app/api/emr/dashboard/route.ts")).toContain('.eq("organization_id", profile.organization_id)');
    expect(read("src/app/api/emr/items/[id]/route.ts")).toContain('existing.organization_id !== organizationId');
  });
  it("requires DONE plus evidence before verification", () => {
    const route = read("src/app/api/emr/items/[id]/route.ts");
    expect(route).toContain('effectiveStatus !== "DONE" || !effectiveEvidence');
    expect(route).toContain('patch.verified_at = null');
  });

  it("legacy prototype tables are quarantined", () => {
    const migration = read("supabase/migrations/20260926_emr_legacy_quarantine_v1.sql");
    expect(migration).toContain("revoke all privileges");
    expect(migration).toContain("emr_departments");
    expect(migration).toContain("emr_digital_signatures");
  });
});
