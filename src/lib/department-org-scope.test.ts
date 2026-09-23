import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("department admin organization scope", () => {
  it("fails closed outside the caller organization", () => {
    const source=readFileSync("src/app/api/admin/departments/[id]/route.ts","utf8");
    expect(source).toContain('.eq("organization_id",caller.organization_id)');
    expect(source).toContain('select("organization_id,is_active")');
    expect(source).toContain("Đơn vị cha không hợp lệ");
    expect(source).toContain('.select("id")');
  });
});
