import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("Admin Đợt 2 TB/Thấp batch", () => {
  it("deactivating a department checks for active references first, returning a confirmable warning instead of silently orphaning them", () => {
    const route = read("src/app/api/admin/departments/[id]/route.ts");
    expect(route).toContain("requires_confirmation:true");
    expect(route).toContain("force_deactivate");
    expect(route).toContain('.from("profiles").select("user_id",{count:"exact",head:true}).eq("primary_department_id",id).eq("is_active",true)');

    const client = read("src/components/admin-departments-client.tsx");
    expect(client).toContain("result.requires_confirmation");
    expect(client).toContain("force_deactivate:true");
  });

  it("brand color hex is validated both client-side and server-side, not trusted as free text", () => {
    const route = read("src/app/api/admin/settings/route.ts");
    expect(route).toContain("HEX_COLOR=/^#[0-9A-Fa-f]{6}$/");
    expect(route).toContain("Màu chính không đúng định dạng mã hex");

    const client = read("src/components/admin-settings-client.tsx");
    expect(client).toContain('pattern="^#[0-9A-Fa-f]{6}$"');
  });

  it("the Catalogs page is honest about being read-only and links to where each thing is actually edited", () => {
    const page = read("src/app/(app)/admin/catalogs/page.tsx");
    expect(page).toContain("CHỈ XEM");
    expect(page).toContain('href="/admin/departments"');
    expect(page).toContain('href="/admin/users"');
  });

  it("the Permissions page can now grant/revoke a permission for a whole Role, not just per-user overrides", () => {
    expect(existsSync("src/app/api/admin/roles/[id]/permissions/route.ts")).toBe(true);
    const route = read("src/app/api/admin/roles/[id]/permissions/route.ts");
    expect(route).toContain('requireApiPermission("permissions.manage")');
    expect(route).toContain('action_type: granted ? "ROLE_PERMISSION_GRANT" : "ROLE_PERMISSION_REVOKE"');

    const client = read("src/components/admin-role-permissions-client.tsx");
    expect(client).toContain("/api/admin/roles/${roleId}/permissions");

    const page = read("src/app/(app)/admin/permissions/page.tsx");
    expect(page).toContain("AdminRolePermissionsClient");
  });

  it("audit log search widens its window instead of silently reporting 'not found' for anything older than 300 rows", () => {
    const page = read("src/app/(app)/admin/audit-log/page.tsx");
    expect(page).toContain(".limit(q ? 5000 : 300)");
  });

  it("organization name is required server-side too, not only via the client form", () => {
    const route = read("src/app/api/admin/settings/route.ts");
    expect(route).toContain('if(!String(b.name||"").trim())return NextResponse.json({error:"Tên bệnh viện không được để trống."}');
  });

  it("the unused writePermissionOverrides function was deleted, not left as dead code", () => {
    expect(existsSync("src/lib/user-permissions.ts")).toBe(false);
  });
});
