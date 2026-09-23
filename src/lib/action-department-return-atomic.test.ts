import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("department Action return route", () => {
  it("uses the atomic return RPC without manual rollback writes", () => {
    const source = readFileSync("src/app/api/tasks/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const RETURN_EXECUTION_RPC = "qlcl_return_action_department_execution_v1"');
    expect(source).toContain("admin.rpc(RETURN_EXECUTION_RPC");
    expect(source).not.toContain('action_department_executions").update({workflow_status:"RETURNED"');
    expect(source).not.toContain("aggregateReturnError");
  });
});
