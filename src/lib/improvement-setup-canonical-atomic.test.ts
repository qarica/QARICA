import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Improvement setup canonical atomic path", () => {
  it("uses one canonical schema and one transaction RPC", () => {
    const source = readFileSync("src/app/api/improvement/projects/[id]/setup/route.ts", "utf8");
    const migration = readFileSync("supabase/migrations/20260924192000_improvement_setup_canonical_atomic_v1.sql", "utf8");
    expect(source).toContain('const SETUP_RPC = "qlcl_manage_improvement_setup_v1"');
    expect(source).toContain("admin.rpc(SETUP_RPC");
    expect(source).not.toContain("insertCompatible");
    expect(source).not.toContain("existingImprovementColumn");
    expect(source).not.toContain("rollbackPatch");
    expect(source).toContain("objective_text,sequence_no,indicator_name");
    expect(source).toContain("title,due_date,status,sequence_no,pdsa_phase");
    expect(migration).toContain("uq_project_objectives_project_normalized_text");
    expect(migration).toContain("uq_project_milestones_project_phase_normalized_title");
    expect(migration).toContain("for update of ip");
    expect(migration).toContain("insert into public.audit_logs");
  });
});
