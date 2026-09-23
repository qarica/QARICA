import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Finding review transaction hardening", () => {
  const source = readFileSync("src/app/api/findings/[id]/workflow/route.ts", "utf8");

  it("uses canonical atomic RPCs for all review outcomes", () => {
    expect(source).toContain('const ACCEPT_RPC = "qlcl_accept_and_close_finding_v1"');
    expect(source).toContain('const RETURN_RPC = "qlcl_return_finding_v1"');
    expect(source).toContain('const ESCALATE_RPC = "qlcl_escalate_finding_to_capa_v1"');
    expect(source).toContain("admin.rpc(ACCEPT_RPC");
    expect(source).toContain("admin.rpc(RETURN_RPC");
    expect(source).toContain("admin.rpc(ESCALATE_RPC");
  });

  it("does not fall back to route-side rollback orchestration", () => {
    expect(source).not.toContain("isMissingRpcFunction");
    expect(source).not.toContain("legacy-fallback");
    expect(source).not.toContain("rollbackLegacyChanges");
    expect(source).not.toContain("findingRollbackPatch");
  });
});
