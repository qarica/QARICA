import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CAPA effectiveness workflow route", () => {
  it("uses atomic RPCs for request and review without route rollback writes", () => {
    const source = readFileSync("src/app/api/capa/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const REQUEST_EFFECTIVENESS_RPC = "qlcl_request_capa_effectiveness_v1"');
    expect(source).toContain('const REVIEW_EFFECTIVENESS_RPC = "qlcl_review_capa_effectiveness_v1"');
    expect(source).toContain("admin.rpc(REQUEST_EFFECTIVENESS_RPC");
    expect(source).toContain("admin.rpc(REVIEW_EFFECTIVENESS_RPC");
    expect(source).not.toContain("capaEffectivenessGate");
    expect(source).not.toContain('from("capa_effectiveness_reviews").insert');
    expect(source).not.toContain('from("capa_effectiveness_reviews").delete');
  });
});
