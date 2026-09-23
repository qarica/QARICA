import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("FMEA workflow route", () => {
  it("uses atomic RPCs for non-terminal transitions and close", () => {
    const source = readFileSync("src/app/api/fmea/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const TRANSITION_RPC = "qlcl_transition_fmea_v1"');
    expect(source).toContain('const CLOSE_RPC = "qlcl_close_fmea_v1"');
    expect(source).toContain("admin.rpc(TRANSITION_RPC");
    expect(source).toContain("admin.rpc(CLOSE_RPC");
    expect(source).not.toContain('from("fmea_studies").update');
    expect(source).not.toContain('from("audit_logs").insert');
    expect(source).not.toContain("getModeActionGate");
  });
});
