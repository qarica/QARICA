import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Report workflow route", () => {
  it("uses atomic RPCs for non-terminal, submit and completion transitions", () => {
    const source = readFileSync("src/app/api/reports/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const TRANSITION_RPC = "qlcl_transition_report_v1"');
    expect(source).toContain('const SUBMIT_RPC = "qlcl_submit_report_v1"');
    expect(source).toContain('const COMPLETE_RPC = "qlcl_confirm_report_received_v1"');
    expect(source).toContain("admin.rpc(TRANSITION_RPC");
    expect(source).toContain("admin.rpc(SUBMIT_RPC");
    expect(source).toContain("admin.rpc(COMPLETE_RPC");
    expect(source).not.toContain('from("reporting_obligations").update');
    expect(source).not.toContain('from("audit_logs").insert');
    expect(source).not.toContain('from("record_links").select');
  });
});
