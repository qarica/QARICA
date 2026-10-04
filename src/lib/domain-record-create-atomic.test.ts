import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("generic Registry domain creation", () => {
  it("uses one canonical RPC and removes archive-compensation writes", () => {
    const source=readFileSync("src/app/api/domain-records/route.ts","utf8");
    expect(source).toContain('const CREATE_RPC="qlcl_create_domain_record_v1"');
    expect(source).toContain("admin.rpc(CREATE_RPC");
    expect(source).not.toContain('admin.rpc("next_record_code"');
    expect(source).not.toContain('from("records").insert');
    expect(source).not.toContain("const fail=async");
    expect(source).not.toContain('lifecycle_status:"ARCHIVED"');
  });

  // Real production bug: the INCIDENT create form (both the full form via
  // domain-create-spec.ts and the quick-report shortcut) sent 4 department
  // fields as "*_department_id", but route.ts's required() check and the
  // RPC's v_fields->>'...' extraction only ever read "*_primary_department_id"
  // — so "Khoa/phòng nơi xảy ra" was always missing and no incident could be
  // created through either UI. Lock the spec/client field keys to the exact
  // names the server actually reads, so a future rename can't silently
  // reintroduce the mismatch (readFileSync+toContain, not a live RPC call,
  // but it directly targets the field-name string that broke production —
  // narrower in scope than a full behavioral test, but it would have caught
  // this specific regression).
  it("keeps INCIDENT department-type field keys consistent across spec, both create UIs, API and RPC (*_primary_department_id)", () => {
    const spec = readFileSync("src/lib/domain-create-spec.ts", "utf8");
    const route = readFileSync("src/app/api/domain-records/route.ts", "utf8");
    const migration = readFileSync("supabase/migrations/20260924173000_domain_record_create_atomic_v1.sql", "utf8");
    const domainCreateClient = readFileSync("src/components/domain-create-client.tsx", "utf8");
    const quickReportClient = readFileSync("src/components/incident-quick-report-client.tsx", "utf8");

    for (const key of [
      "patient_primary_department_id",
      "incident_location_primary_department_id",
      "reporter_primary_department_id",
      "on_behalf_primary_department_id",
    ]) {
      expect(spec).toContain(`key:"${key}"`);
      expect(spec).not.toContain(`key:"${key.replace("_primary_department_id", "_department_id")}"`);
      expect(migration).toContain(`v_fields->>'${key}'`);
    }
    expect(route).toContain('required("incident_location_primary_department_id")');
    expect(route).toContain("f.incident_location_primary_department_id");
    expect(domainCreateClient).toContain("values.incident_location_primary_department_id");
    expect(domainCreateClient).not.toContain("values.incident_location_department_id");
    expect(quickReportClient).toContain("incident_location_primary_department_id: departmentId");
  });
});
