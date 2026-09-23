import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("incident CAPA creation route", () => {
  it("uses the atomic RPC without route-side record/CAPA/link rollback writes", () => {
    const source=readFileSync("src/app/api/incidents/[id]/capa/route.ts","utf8");
    expect(source).toContain('admin.rpc("qlcl_create_capa_from_incident_v1"');
    expect(source).not.toContain('from("records").insert');
    expect(source).not.toContain('from("capas").insert');
    expect(source).not.toContain('relation_type: "GENERATED_CAPA"');
    expect(source).not.toContain("const rollback =");
  });
});
