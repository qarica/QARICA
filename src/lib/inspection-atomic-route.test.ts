import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Inspection terminal workflow", () => {
  it("uses canonical atomic RPCs without legacy countdown/close fallbacks", () => {
    const source = readFileSync("src/app/api/inspections/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const COUNTDOWN_RPC = "qlcl_generate_inspection_countdown_v1"');
    expect(source).toContain('const CLOSE_RPC = "qlcl_close_inspection_v1"');
    expect(source).toContain("admin.rpc(COUNTDOWN_RPC");
    expect(source).toContain("admin.rpc(CLOSE_RPC");
    expect(source).not.toContain("isMissingRpcFunction");
    expect(source).not.toContain("legacy-fallback");
    expect(source).not.toContain("const MILESTONES");
    expect(source).not.toContain('from("inspection_action_links").insert');
  });
});
