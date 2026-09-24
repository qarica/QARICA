import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("incident RCA optimistic concurrency", () => {
  it("requires a revision token for structured RCA saves", () => {
    const route=readFileSync("src/app/api/incidents/[id]/rca/route.ts","utf8");
    const client=readFileSync("src/components/incident-rca-workspace-client.tsx","utf8");
    const migration=readFileSync("supabase/migrations/20260924181500_rca_revision_concurrency_v2.sql","utf8");
    expect(route).toContain('qlcl_save_incident_rca_structure_v2');
    expect(route).toContain("p_expected_revision: expectedRevision");
    expect(client).toContain("expected_revision: revision");
    expect(client).toContain("setRevision(Number(json.revision || 0))");
    expect(migration).toContain("v_rca.revision <> p_expected_revision");
  });
});
