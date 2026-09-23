import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("USER/GROUP Action verification route", () => {
  it("uses the atomic verification RPC without route-side evidence rollback", () => {
    const source = readFileSync("src/app/api/tasks/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const VERIFY_ACTION_RPC = "qlcl_verify_action_v1"');
    expect(source).toContain("admin.rpc(VERIFY_ACTION_RPC");
    expect(source).not.toContain("evidenceUpdateError");
    expect(source).not.toContain('workflow_status: "VERIFYING", verified_at: null');
  });
});
