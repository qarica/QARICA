import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CAPA start-actions workflow", () => {
  it("uses the atomic start-actions RPC without route-side gates/writes", () => {
    const source = readFileSync("src/app/api/capa/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const START_ACTIONS_RPC = "qlcl_start_capa_actions_v1"');
    expect(source).toContain("admin.rpc(START_ACTIONS_RPC");
    expect(source).not.toContain('activeTypes.has("CORRECTIVE")');
    expect(source).not.toContain('activeTypes.has("PREVENTIVE")');
  });
});
