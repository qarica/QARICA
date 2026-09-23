import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Feedback workflow route", () => {
  it("uses atomic RPCs for transitions, Finding creation and close", () => {
    const source = readFileSync("src/app/api/feedback/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const TRANSITION_RPC = "qlcl_transition_feedback_v1"');
    expect(source).toContain('const CREATE_FINDING_RPC = "qlcl_create_feedback_finding_v1"');
    expect(source).toContain('const CLOSE_RPC = "qlcl_close_feedback_v1"');
    expect(source).toContain("admin.rpc(TRANSITION_RPC");
    expect(source).toContain("admin.rpc(CREATE_FINDING_RPC");
    expect(source).toContain("admin.rpc(CLOSE_RPC");
    expect(source).not.toContain('from("feedback_records").update');
    expect(source).not.toContain('from("audit_logs").insert');
    expect(source).not.toContain("updated_at: now");
  });
});
