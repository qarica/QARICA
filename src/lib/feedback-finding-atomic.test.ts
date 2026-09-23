import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Feedback to Finding workflow", () => {
  it("uses the atomic Finding creation RPC without manual orphan cleanup", () => {
    const source = readFileSync("src/app/api/feedback/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const CREATE_FINDING_RPC = "qlcl_create_feedback_finding_v1"');
    expect(source).toContain("admin.rpc(CREATE_FINDING_RPC");
    expect(source).not.toContain('from("findings").insert');
    expect(source).not.toContain('from("record_links").insert');
    expect(source).not.toContain('lifecycle_status: "ARCHIVED"');
  });
});
