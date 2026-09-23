import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("department Action submission route", () => {
  it("uses the atomic submission RPC for department execution", () => {
    const source = readFileSync("src/app/api/tasks/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const SUBMIT_EXECUTION_RPC = "qlcl_submit_action_department_execution_v1"');
    expect(source).toContain("admin.rpc(SUBMIT_EXECUTION_RPC");
    expect(source).not.toContain('action_department_executions").update({workflow_status:"SUBMITTED"');
    expect(source).not.toContain("Không để execution cuối bị kẹt ở SUBMITTED");
  });
});
