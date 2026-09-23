import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Assessment atomic workflow", () => {
  it("uses canonical atomic RPCs for start review and finalize", () => {
    const source = readFileSync("src/app/api/assessments/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const TRANSITION_RPC = "qlcl_transition_assessment_round_v1"');
    expect(source).toContain('const FINALIZE_RPC = "qlcl_finalize_assessment_round_v1"');
    expect(source).toContain("admin.rpc(TRANSITION_RPC");
    expect(source).toContain("admin.rpc(FINALIZE_RPC");
    expect(source).not.toContain('.from("assessment_round_criteria").update');
    expect(source).not.toContain('.from("assessment_rounds").update');
    expect(source).not.toContain('.from("audit_logs").insert');
  });
});
