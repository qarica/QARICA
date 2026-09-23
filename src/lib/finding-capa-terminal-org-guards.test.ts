import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Finding/CAPA terminal organization guards", () => {
  it("guards all terminal RPCs with active actor organization scope", () => {
    const sql=readFileSync("supabase/migrations/20260923171000_finding_capa_terminal_org_guards_v2.sql","utf8");
    expect(sql.match(/join public\.profiles p on p\.organization_id=r\.organization_id/g)?.length).toBe(3);
    expect(sql.match(/p\.is_active=true/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sql).toContain("public.next_record_code(v_record.organization_id,'CAPA',v_record.work_year)");
  });
});
