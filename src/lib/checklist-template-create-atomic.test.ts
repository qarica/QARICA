import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("checklist template creation route", () => {
  it("uses the atomic RPC without route-side rollback deletion", () => {
    const source = readFileSync("src/app/api/monitoring/templates/route.ts", "utf8");
    expect(source).toContain('const CREATE_RPC = "qlcl_create_checklist_template_v1"');
    expect(source).toContain("admin.rpc(CREATE_RPC");
    expect(source).not.toContain('from("checklist_templates").insert');
    expect(source).not.toContain('from("checklist_versions").insert');
    expect(source).not.toContain('from("checklist_templates").delete');
  });
});
