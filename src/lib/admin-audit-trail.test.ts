import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Real finding from a full-app review: not a single admin route (user access
// changes, department create/update/deactivate, organization settings,
// work-calendar holidays) wrote to audit_logs — "Nhật ký hệ thống" never
// showed who changed a permission, deactivated a department, or edited
// settings. Every other module (CAPA, EMR, plans, criteria...) already
// writes audit_logs on sensitive writes; this closes the gap for admin.
describe("admin routes write audit_logs for sensitive writes (closes the admin audit-trail gap)", () => {
  it("departments create/update write audit_logs with the actual actor", () => {
    const createRoute = read("src/app/api/admin/departments/route.ts");
    expect(createRoute).toContain('admin.from("audit_logs").insert');
    expect(createRoute).toContain("DEPARTMENT_CREATE");
    const updateRoute = read("src/app/api/admin/departments/[id]/route.ts");
    expect(updateRoute).toContain('admin.from("audit_logs").insert');
    expect(updateRoute).toContain("DEPARTMENT_DEACTIVATE");
    expect(updateRoute).toContain("DEPARTMENT_UPDATE");
  });

  it("organization settings (Cài đặt hệ thống) writes audit_logs with before/after", () => {
    const route = read("src/app/api/admin/settings/route.ts");
    expect(route).toContain('admin.from("audit_logs").insert');
    expect(route).toContain("ORGANIZATION_SETTINGS_UPDATE");
    expect(route).toContain("old_value:before");
  });

  it("work-calendar-holidays create/toggle write audit_logs", () => {
    const route = read("src/app/api/admin/work-calendar-holidays/route.ts");
    expect(route).toContain('admin.from("audit_logs").insert');
    expect(route).toContain("HOLIDAY_CREATE");
    expect(route).toContain("HOLIDAY_REACTIVATE");
    expect(route).toContain("HOLIDAY_DEACTIVATE");
  });

  it("user creation and access/permission changes write audit_logs", () => {
    const createRoute = read("src/app/api/admin/users/route.ts");
    expect(createRoute).toContain('admin.from("audit_logs").insert');
    expect(createRoute).toContain("USER_CREATE");
    const updateRoute = read("src/app/api/admin/users/[id]/route.ts");
    expect(updateRoute).toContain('admin.from("audit_logs").insert');
    expect(updateRoute).toContain("USER_ACCESS_UPDATE");
    expect(updateRoute).toContain("USER_DEACTIVATE");
    expect(updateRoute).toContain("USER_REACTIVATE");
  });
});
