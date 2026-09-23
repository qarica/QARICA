import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Incident atomic workflow route", () => {
  it("fails closed for start, complete and close instead of using legacy fallbacks", () => {
    const source = readFileSync("src/app/api/incidents/[id]/workflow/route.ts", "utf8");
    expect(source).toContain("admin.rpc(START_INV_RPC");
    expect(source).toContain("admin.rpc(COMPLETE_INV_RPC");
    expect(source).toContain("admin.rpc(CLOSE_RPC");
    expect(source).not.toContain("isMissingRpcFunction");
    expect(source).not.toContain("legacy-fallback");
    expect(source).not.toContain('from("incident_investigations").insert');
    expect(source).not.toContain('from("incident_investigations").delete');
  });
});
