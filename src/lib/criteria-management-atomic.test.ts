import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("criteria management atomic routes", () => {
  it("creates criteria set through the canonical RPC", () => {
    const source = readFileSync("src/app/api/criteria-sets/route.ts", "utf8");
    expect(source).toContain('const CREATE_RPC = "qlcl_create_criteria_set_v1"');
    expect(source).toContain("admin.rpc(CREATE_RPC");
    expect(source).not.toContain('from("criteria_sets").insert');
    expect(source).not.toContain('from("criteria_set_versions").insert');
    expect(source).not.toContain('from("criteria_sets").delete');
  });

  it("creates criteria items through the canonical RPC", () => {
    const source = readFileSync("src/app/api/criteria-sets/[id]/items/route.ts", "utf8");
    expect(source).toContain('const CREATE_ITEM_RPC = "qlcl_create_criteria_item_v1"');
    expect(source).toContain("admin.rpc(CREATE_ITEM_RPC");
    expect(source).not.toContain('from("criteria_items").insert');
  });

  it("clones criteria revisions through the canonical RPC", () => {
    const source = readFileSync("src/app/api/criteria-sets/[id]/versions/route.ts", "utf8");
    expect(source).toContain('const CREATE_REVISION_RPC = "qlcl_create_criteria_revision_v1"');
    expect(source).toContain("admin.rpc(CREATE_REVISION_RPC");
    expect(source).not.toContain('from("criteria_set_versions").insert');
    expect(source).not.toContain('from("criteria_items").insert');
    expect(source).not.toContain('from("criteria_set_versions").delete');
  });
});
