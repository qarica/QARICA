import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("External Assessment atomic workflow", () => {
  it("routes link, score and close through canonical RPCs without direct writes", () => {
    const source = readFileSync("src/app/api/external-assessments/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const LINK_SELF_RPC = "qlcl_link_external_assessment_self_v1"');
    expect(source).toContain('const SAVE_SCORE_RPC = "qlcl_save_external_assessment_score_v1"');
    expect(source).toContain('const CLOSE_RPC = "qlcl_close_external_assessment_v1"');
    expect(source).toContain("admin.rpc(LINK_SELF_RPC");
    expect(source).toContain("admin.rpc(SAVE_SCORE_RPC");
    expect(source).toContain("admin.rpc(CLOSE_RPC");
    expect(source).not.toContain('.from("record_links").insert');
    expect(source).not.toContain('.from("external_assessment_scores").insert');
    expect(source).not.toContain('.from("external_assessment_scores").update');
    expect(source).not.toContain('.from("records").update');
    expect(source).not.toContain('.from("record_status_history").insert');
    expect(source).not.toContain('.from("audit_logs").insert');
  });
});
