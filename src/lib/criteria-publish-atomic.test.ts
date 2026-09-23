import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("criteria publish transaction", () => {
  it("uses one audited atomic RPC and no route-side dual update", () => {
    const source=readFileSync("src/app/api/criteria-sets/[id]/publish/route.ts","utf8");
    expect(source).toContain('const PUBLISH_RPC = "qlcl_publish_criteria_version_v1"');
    expect(source).toContain("admin.rpc(PUBLISH_RPC");
    expect(source).not.toContain('from("criteria_set_versions").update');
  });
});
