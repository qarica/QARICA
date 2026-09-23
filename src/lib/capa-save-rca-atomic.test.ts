import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CAPA RCA save workflow", () => {
  it("uses the atomic RCA save RPC without insert/delete rollback", () => {
    const source = readFileSync("src/app/api/capa/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const SAVE_RCA_RPC = "qlcl_save_capa_rca_v1"');
    expect(source).toContain("admin.rpc(SAVE_RCA_RPC");
    expect(source).not.toContain('from("rca_analyses").insert');
    expect(source).not.toContain('from("rca_analyses").delete');
  });
});
