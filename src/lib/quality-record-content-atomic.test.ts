import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("quality record content edit atomic path", () => {
  it("does not use route-side rollback writes for Finding, CAPA or Risk", () => {
    const source=readFileSync("src/app/api/quality-records/[id]/content/route.ts","utf8");
    const migration=readFileSync("supabase/migrations/20260924190500_quality_record_content_atomic_v1.sql","utf8");
    expect(source).toContain('admin.rpc("qlcl_update_quality_record_content_v1"');
    expect(source).not.toContain("const rollback:");
    expect(source).not.toContain('admin.from(table).update(rollback)');
    expect(source).not.toContain('admin.from("records").update({ title');
    expect(migration).toContain("for update");
    expect(migration).toContain("insert into public.audit_logs");
  });
});
