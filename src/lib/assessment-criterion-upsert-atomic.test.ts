import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("criterion assessment save route", () => {
  it("uses the atomic upsert RPC and no read-then-write branch", () => {
    const source=readFileSync("src/app/api/assessments/[id]/criteria/route.ts","utf8");
    expect(source).toContain('const SAVE_RPC="qlcl_save_criterion_assessment_v1"');
    expect(source).toContain("admin.rpc(SAVE_RPC");
    expect(source).not.toContain('from("criterion_assessments").select');
    expect(source).not.toContain('from("criterion_assessments").insert');
    expect(source).not.toContain('from("criterion_assessments").update');
  });
});
