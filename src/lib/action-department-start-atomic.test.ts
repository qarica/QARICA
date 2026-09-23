import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("department Action start/resume route", () => {
  it("uses the atomic start RPC without manual rollback writes", () => {
    const source = readFileSync("src/app/api/tasks/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const START_EXECUTION_RPC = "qlcl_start_action_department_execution_v1"');
    expect(source).toContain("admin.rpc(START_EXECUTION_RPC");
    expect(source).not.toContain("aggregateStartError");
    expect(source).not.toContain('action_department_executions").update({ workflow_status: "IN_PROGRESS"');
    expect(source).not.toContain('action_department_executions").update({workflow_status:"IN_PROGRESS"');
  });
});
