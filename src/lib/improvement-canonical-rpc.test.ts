import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Improvement workflow canonical RPCs", () => {
  it("requires atomic proposal to project conversion", () => {
    const source = readFileSync("src/app/api/improvement/proposals/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const CONVERT_RPC = "qlcl_approve_proposal_create_project_v1"');
    expect(source).toContain("admin.rpc(CONVERT_RPC");
    expect(source).not.toContain("isMissingRpcFunction");
    expect(source).not.toContain("legacy-fallback");
    expect(source).not.toContain('from("records").insert({ organization_id: record.organization_id');
  });

  it("requires atomic Improvement Project close", () => {
    const source = readFileSync("src/app/api/improvement/projects/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const CLOSE_PROJECT_RPC = "qlcl_close_improvement_project_v1"');
    expect(source).toContain("admin.rpc(CLOSE_PROJECT_RPC");
    expect(source).not.toContain("isMissingRpcFunction");
    expect(source).not.toContain('transaction = "legacy-fallback"');
    expect(source).not.toContain('from("record_status_history").insert');
  });
});
