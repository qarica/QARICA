import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Directive workflow route", () => {
  it("uses atomic RPCs for terminal and non-terminal transitions", () => {
    const source = readFileSync("src/app/api/directives/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const COMPLETE_RPC = "qlcl_complete_directive_v1"');
    expect(source).toContain('const TRANSITION_RPC = "qlcl_transition_directive_v1"');
    expect(source).toContain("admin.rpc(COMPLETE_RPC");
    expect(source).toContain("admin.rpc(TRANSITION_RPC");
    expect(source).not.toContain('from("external_directives").update');
    expect(source).not.toContain('from("audit_logs").insert');
    expect(source).not.toContain('from("directive_action_links").select');
    expect(source).not.toContain('from("evidence_links").select');
  });
});
