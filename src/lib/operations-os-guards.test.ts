import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Guardrail tests for the Operations OS routes. Integration/RLS tests require a staging database. */
describe("Work OS API safeguards", () => {
  const route = readFileSync("src/app/api/work/route.ts", "utf8");
  it("rejects unsupported state filters", () => {
    expect(route).toContain('["OPEN", "WAITING", "DONE", "CANCELLED", "ALL"].includes(state)');
    expect(route).toContain('status: 400');
  });
  it("uses authenticated context and bounds returned work items", () => {
    expect(route).toContain("requireApiContext()");
    expect(route).toContain(".limit(500)");
  });
  it("matches followups using both source type and source ID", () => {
    expect(route).toContain('f.source_type+":"+f.source_id');
    expect(route).toContain('row.source_type+":"+row.source_id');
  });
});

describe("Knowledge API safeguards", () => {
  const route = readFileSync("src/app/api/knowledge/route.ts", "utf8");
  it("requires an authenticated context and constrains visibility", () => {
    expect(route).toContain("requireApiContext()");
    expect(route).toContain('visibility==="PRIVATE"?null:auth.context.user.organizationId');
  });
  it("bounds user-controlled input", () => {
    expect(route).toContain("q.length>200");
    expect(route).toContain("content.length>100000");
    expect(route).toContain("Ngày nhật ký không hợp lệ");
  });
  it("does not accept caller-supplied owner_user_id", () => {
    expect(route).toContain("owner_user_id:auth.user.id");
  });
});
