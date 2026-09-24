import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("FMEA scoring workflow", () => {
  it("uses the atomic score RPC and removes migration compatibility writes", () => {
    const source=readFileSync("src/app/api/fmea/[id]/assessments/route.ts","utf8");
    expect(source).toContain('const SCORE_RPC = "qlcl_score_fmea_mode_v1"');
    expect(source).toContain("c.admin.rpc(SCORE_RPC");
    expect(source).not.toContain('from("fmea_mode_assessments").insert');
    expect(source).not.toContain('from("audit_logs").insert');
    expect(source).not.toContain("đang chờ áp dụng migration");
    expect(source).not.toContain("schema cache");
  });
});
