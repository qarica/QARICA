import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Evidence download permission", () => {
  it("uses a generic Evidence permission instead of tasks.view", () => {
    const source=readFileSync("src/app/api/evidence/[id]/download/route.ts","utf8");
    const migration=readFileSync("supabase/migrations/20260924193000_evidence_view_permission_v1.sql","utf8");
    expect(source).toContain('requireApiPermission("evidence.view")');
    expect(source).not.toContain('requireApiPermission("tasks.view")');
    expect(migration).toContain("'evidence.view'");
    expect(migration).toContain("p_old.code='tasks.view'");
  });
});
