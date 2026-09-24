import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("criteria item active-state route", () => {
  it("uses the atomic RPC for activate/deactivate and removes route-side child cascade", () => {
    const source=readFileSync("src/app/api/criteria-items/[id]/route.ts","utf8");
    expect(source).toContain('admin.rpc("qlcl_set_criteria_item_active_v1"');
    expect(source).not.toContain('.eq("parent_criteria_item_id",id)');
  });
});
