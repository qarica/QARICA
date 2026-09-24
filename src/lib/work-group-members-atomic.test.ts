import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work-group membership update", () => {
  it("uses the atomic RPC instead of member-by-member writes", () => {
    const source=readFileSync("src/app/api/work-groups/[id]/route.ts","utf8");
    expect(source).toContain('admin.rpc("qlcl_update_work_group_v1"');
    expect(source).not.toContain('from("work_group_members").update');
    expect(source).not.toContain('from("work_group_members").insert');
    expect(source).not.toContain('from("work_groups").update({\n    code,name');
  });
});
