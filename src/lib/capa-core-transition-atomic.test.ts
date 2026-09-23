import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CAPA core transition route", () => {
  it("uses the atomic core transition RPC for START, APPROVE and SET_RESOURCES", () => {
    const source = readFileSync("src/app/api/capa/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const CORE_TRANSITION_RPC = "qlcl_transition_capa_v1"');
    expect(source).toContain("admin.rpc(CORE_TRANSITION_RPC");
    expect(source).not.toContain('admin.from("capas").update({ workflow_status: newStatus');
    expect(source).not.toContain('admin.from("capas").update({ required_resources: resources');
    expect(source).not.toContain('action_type:`CAPA_${command}`');
  });
});
