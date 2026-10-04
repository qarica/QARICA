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
  it("hides EMR navigation from users without emr.view (nav label renamed from the raw EMR acronym to Bệnh án điện tử — explicit request)", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('{ label: "BỆNH ÁN ĐIỆN TỬ", href: "/emr", icon: "network", permission: "emr.view" }');
    expect(nav).toContain('permission: "emr.view"');
  });
  it("uses Vietnam-local calendar dates for deadline control", () => {
    const dashboard = read("src/app/api/emr/dashboard/route.ts");
    expect(dashboard).toContain('timeZone: "Asia/Ho_Chi_Minh"');
    expect(dashboard).toContain('x.due_date < today');
  });
  it("keeps dashboard and mutations tenant-scoped", () => {
    expect(read("src/app/api/emr/dashboard/route.ts")).toContain('.eq("organization_id", organizationId)');
    expect(read("src/app/api/emr/items/[id]/route.ts")).toContain('existing.organization_id !== organizationId');
  });
  it("requires DONE plus evidence before verification", () => {
    const route = read("src/app/api/emr/items/[id]/route.ts");
    expect(route).toContain('effectiveStatus !== "DONE" || !effectiveEvidence');
    expect(route).toContain('patch.verified_at = null');
  });

  // Real finding from a full-app security review: emr.manage was shared by
  // whoever moves an item to DONE and whoever verifies it, with no check
  // that they differ — one person could flag their own work DONE and
  // immediately self-verify the go-live gate. Block both the same-request
  // combo (status->DONE + verify_completed in one call) and the two-call
  // case (verifier is the same person who last touched the item).
  it("blocks self-verification of the go-live gate (verifier must differ from whoever last updated the item)", () => {
    const route = read("src/app/api/emr/items/[id]/route.ts");
    expect(route).toContain('select("id,organization_id,status,evidence_url,category,updated_by")');
    expect(route).toContain("const selfTransitionToDone = typeof body.status === \"string\" && body.status === \"DONE\";");
    expect(route).toContain("selfTransitionToDone || existing.updated_by === auth.user.id");
    expect(route).toContain("Người xác minh phải khác người vừa cập nhật hạng mục này");
  });

  it("legacy prototype tables are quarantined", () => {
    const migration = read("supabase/migrations/20260926_emr_legacy_quarantine_v1.sql");
    expect(migration).toContain("revoke all privileges");
    expect(migration).toContain("emr_departments");
    expect(migration).toContain("emr_digital_signatures");
  });
});
