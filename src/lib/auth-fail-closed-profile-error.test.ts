import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("RequestContext fail-closed and unambiguous department lookup", () => {
  const auth = readFileSync("src/lib/auth.ts", "utf8");
  const context = readFileSync("src/lib/request-context.ts", "utf8");

  it("keeps requireUserContext thin and delegates to the shared RequestContext loader", () => {
    expect(auth).toContain("loadRequestContext");
    expect(auth).not.toContain("departments(name)");
  });

  it("loads department name with a separate primary_department_id query", () => {
    expect(context).toContain('.from("departments").select("name").eq("id", profile.primary_department_id).maybeSingle()');
    expect(context).toContain("primaryDepartmentName:");
  });

  it("fails closed on profile, roles, overrides and scopes query errors", () => {
    expect(context).toContain('queryError("profile"');
    expect(context).toContain('queryError("roles"');
    expect(context).toContain('queryError("permission-overrides"');
    expect(context).toContain('queryError("scopes"');
  });

  it("also fails closed on downstream permission/org/department queries", () => {
    expect(context).toContain('queryError("role-permissions"');
    expect(context).toContain('queryError("organization"');
    expect(context).toContain('queryError("department"');
    expect(context).toContain('queryError("department-roles"');
  });
});
