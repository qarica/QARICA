import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Real finding from a full-app review: saving a department's "Nhân sự & vai
// trò" (Trưởng/Phụ trách + Mạng lưới QLCL) ran 2 separate DB calls — disable
// old active roles, then insert new ones — with no shared transaction. If the
// insert failed partway (network blip, constraint violation), the department
// ended up with zero Trưởng/Mạng lưới QLCL and nothing to replace them.
// Fixed by moving both steps into one atomic RPC (qlcl_set_department_roles_v1),
// matching every other qlcl_*_v1 transaction in this codebase.
describe("department Nhân sự & vai trò save is atomic (no partial-write data loss)", () => {
  it("the RPC does both disable-old and insert-new inside a single function body, with validation and audit_logs", () => {
    const migration = read("supabase/migrations/20261024_department_roles_atomic_v1.sql");
    expect(migration).toContain("create or replace function public.qlcl_set_department_roles_v1(");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path to ''");
    expect(migration).toContain("update public.department_user_roles");
    expect(migration).toContain("insert into public.department_user_roles");
    expect(migration).toContain("insert into public.audit_logs");
    expect(migration).toContain("revoke all on function public.qlcl_set_department_roles_v1");
    expect(migration).toContain("grant execute on function public.qlcl_set_department_roles_v1");
  });

  it("the route calls the atomic RPC instead of 2 separate table writes", () => {
    const route = read("src/app/api/admin/departments/[id]/roles/route.ts");
    expect(route).toContain('const SET_ROLES_RPC = "qlcl_set_department_roles_v1"');
    expect(route).toContain("admin.rpc(SET_ROLES_RPC");
    expect(route).not.toContain('admin.from("department_user_roles").update');
    expect(route).not.toContain('admin.from("department_user_roles").insert');
  });
});
