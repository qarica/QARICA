import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Risk workflow route", () => {
  it("uses atomic RPCs for assessment and non-terminal treatment transitions", () => {
    const source = readFileSync("src/app/api/risks/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const ASSESS_RISK_RPC = "qlcl_assess_risk_v1"');
    expect(source).toContain('const TRANSITION_RISK_RPC = "qlcl_transition_risk_v1"');
    expect(source).toContain('const ACCEPT_RISK_RPC = "qlcl_accept_risk_v1"');
    expect(source).toContain('const RETIRE_RISK_RPC = "qlcl_retire_risk_v1"');
    expect(source).toContain("admin.rpc(ASSESS_RISK_RPC");
    expect(source).toContain("admin.rpc(TRANSITION_RISK_RPC");
    expect(source).not.toContain('from("risk_assessments").insert');
    expect(source).not.toContain('from("risks").update');
    expect(source).not.toContain('from("audit_logs").insert');
    expect(source).not.toContain('transaction: "direct"');
  });
});
