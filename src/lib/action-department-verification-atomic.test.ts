import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("department Action verification route", () => {
  it("uses the atomic verification RPC without a legacy write fallback", () => {
    const source = readFileSync("src/app/api/tasks/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const VERIFY_EXECUTION_RPC = "qlcl_verify_action_department_execution_v1"');
    expect(source).toContain("admin.rpc(VERIFY_EXECUTION_RPC");
    expect(source).not.toContain("isMissingRpcFunction(txError, VERIFY_EXECUTION_RPC)");
    expect(source).not.toContain("Fallback path (RPC not deployed yet)");
    expect(source).not.toContain('transaction: "legacy-fallback"');
  });
});
