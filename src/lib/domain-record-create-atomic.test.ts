import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("generic Registry domain creation", () => {
  it("uses one canonical RPC and removes archive-compensation writes", () => {
    const source=readFileSync("src/app/api/domain-records/route.ts","utf8");
    expect(source).toContain('const CREATE_RPC="qlcl_create_domain_record_v1"');
    expect(source).toContain("admin.rpc(CREATE_RPC");
    expect(source).not.toContain('admin.rpc("next_record_code"');
    expect(source).not.toContain('from("records").insert');
    expect(source).not.toContain("const fail=async");
    expect(source).not.toContain('lifecycle_status:"ARCHIVED"');
  });
});
