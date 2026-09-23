import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("record lifecycle canonical transaction", () => {
  it("has no route-side legacy rollback fallback", () => {
    const source=readFileSync("src/app/api/record-lifecycle/route.ts","utf8");
    expect(source).toContain('const LIFECYCLE_RPC = "qlcl_change_record_lifecycle_v1"');
    expect(source).toContain("admin.rpc(LIFECYCLE_RPC");
    expect(source).not.toContain("legacy-fallback");
    expect(source).not.toContain("CHILD_CANCEL");
    expect(source).not.toContain("isMissingRpcFunction");
  });
});
