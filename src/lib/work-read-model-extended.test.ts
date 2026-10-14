import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("extended work read model", () => {
  const migration = readFileSync("supabase/migrations/20261102_work_read_model_extended_v1.sql", "utf8");
  const assistant = readFileSync("src/lib/assistant-tool-gateway.ts", "utf8");

  it("projects major operational domains through canonical record ids", () => {
    for (const type of ["FINDING","CAPA","RISK","DIRECTIVE","REPORT","IMPROVEMENT_PROJECT","IMPROVEMENT_PROPOSAL"]) {
      expect(migration).toContain(type);
    }
    expect(migration).toContain("'RECORD',r.id,r.id");
  });

  it("keeps assistant my-work summary user-scoped", () => {
    expect(assistant).toContain('.eq("owner_user_id",context.user.id)');
  });
});
