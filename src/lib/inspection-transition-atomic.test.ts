import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Inspection workflow route", () => {
  it("uses atomic RPCs for countdown, non-terminal transitions and close", () => {
    const source = readFileSync("src/app/api/inspections/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const COUNTDOWN_RPC = "qlcl_generate_inspection_countdown_v1"');
    expect(source).toContain('const TRANSITION_RPC = "qlcl_transition_inspection_v1"');
    expect(source).toContain('const CLOSE_RPC = "qlcl_close_inspection_v1"');
    expect(source).toContain("admin.rpc(COUNTDOWN_RPC");
    expect(source).toContain("admin.rpc(TRANSITION_RPC");
    expect(source).toContain("admin.rpc(CLOSE_RPC");
    expect(source).not.toContain('from("inspection_events").update');
    expect(source).not.toContain('from("audit_logs").insert');
  });
});
