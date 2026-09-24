import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Plan Action creation route", () => {
  it("fails closed when the canonical RPC is missing and has no multi-write fallback", () => {
    const source=readFileSync("src/app/api/plans/[id]/actions/route.ts","utf8");
    expect(source).toContain('const CREATE_PLAN_ACTION_RPC = "qlcl_create_plan_action_v2"');
    expect(source).toContain("admin.rpc(CREATE_PLAN_ACTION_RPC");
    expect(source).toContain("isMissingRpcFunction(txError, CREATE_PLAN_ACTION_RPC)");
    expect(source).not.toContain('transaction: "legacy-fallback"');
    expect(source).not.toContain('admin.from("records").insert');
    expect(source).not.toContain('admin.from("actions").insert');
    expect(source).not.toContain('admin.from("program_action_links").insert');
  });

  it("returns a warning instead of silently ignoring an already-overdue approved deadline", () => {
    const source=readFileSync("src/app/api/plans/[id]/actions/route.ts","utf8");
    expect(source).toContain("deadlineWarning");
    expect(source).toContain("warning: deadlineWarning");
  });
});
