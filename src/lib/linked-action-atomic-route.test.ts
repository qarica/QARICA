import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("linked Action creation route", () => {
  it("fails closed instead of using the legacy multi-write fallback", () => {
    const source = readFileSync("src/app/api/records/[id]/actions/route.ts", "utf8");
    expect(source).toContain('const CREATE_LINKED_ACTION_RPC = "qlcl_create_linked_action_v2"');
    expect(source).toContain("admin.rpc(CREATE_LINKED_ACTION_RPC");
    expect(source).not.toContain("isMissingRpcFunction(txError, CREATE_LINKED_ACTION_RPC)");
    expect(source).not.toContain('transaction: "legacy-fallback"');
    expect(source).not.toContain('admin.from("records").insert({ organization_id: caller.organization_id, record_type: "ACTION"');
  });
});
