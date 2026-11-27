import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("vai trò thủ kho: chỉ thấy menu Kho", () => {
  const sql = read("supabase/migrations/20261202000005_lab_supplies_keeper_role_v1.sql");
  it("migration tạo vai trò LAB_SUPPLIES_KEEPER chỉ với 2 quyền Kho, idempotent, không gắn cứng người dùng/email", () => {
    expect(sql).toContain("'LAB_SUPPLIES_KEEPER'");
    expect(sql).toContain("p.code in ('lab_supplies.view', 'lab_supplies.manage')");
    expect(sql).toContain("where not exists");
    expect(sql).not.toMatch(/@/);
    expect(sql).not.toMatch(/auth\.users/);
    // không cấp quyền nào ngoài Kho
    expect((sql.match(/'[a-z_]+\.[a-z_]+'/g) || []).filter((c) => !c.includes("lab_supplies"))).toEqual([]);
  });
  it("mục Kho trong menu chỉ cần lab_supplies.view", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('href: "/lab-supplies/hoa-chat", icon: "droplets", permission: "lab_supplies.view"');
    expect(nav).toContain('href: "/lab-supplies/vat-tu", icon: "archive", permission: "lab_supplies.view"');
  });
  it("trang đích sau đăng nhập và nơi trang bị từ chối chuyển về: người không có dashboard.view luôn được chuyển tới menu đầu tiên của họ, không bao giờ thấy Tổng quan", () => {
    const d = read("src/app/(app)/dashboard/page.tsx");
    expect(d).toContain('if (!hasPermission(user, "dashboard.view")) {');
    expect(d).not.toContain(".forbidden)");
    expect(d).toContain("visibleNavGroups(user)");
    expect(d).toContain('landing !== "/dashboard"');
  });
});

describe("banner nhắc việc: màu dịu", () => {
  it("nền trung tính, chỉ chấm màu nhỏ ở từng mục (không còn nền đỏ/vàng/xanh đậm)", () => {
    const c = read("src/components/lab-supplies-client.tsx");
    expect(c).toContain(".lab-supplies .ls-alert-banner{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;border:1px solid #e2e8f0;background:#f8fafc");
    expect(c).toContain(".lab-supplies .ls-alert-item::before{");
    for (const bad of ["#fffbeb", "#fee2e2", "#fef3c7", "#dbeafe"]) expect(c.slice(c.indexOf(".ls-alert-banner{"), c.indexOf(".ls-adjust-form .ls-head-grid{")), bad).not.toContain(bad);
  });
});

describe("cách ly dữ liệu cấp cơ sở dữ liệu cho tài khoản chỉ có quyền Kho", () => {
  const sql = readFileSync("supabase/migrations/20261202000006_kho_only_data_isolation_v1.sql", "utf8");
  it("hàm nhận diện tài khoản chỉ-Kho dựa trên quyền hiệu lực (vai trò + ghi đè), chỉ cho authenticated/service_role", () => {
    expect(sql).toContain("create or replace function public.qlcl_is_kho_only()");
    expect(sql).toContain("code like 'lab\\_supplies.%'");
    expect(sql).toContain("code not like 'lab\\_supplies.%'");
    expect(sql).toContain("revoke all on function public.qlcl_is_kho_only() from public, anon;");
  });
  it("chính sách RESTRICTIVE cho mọi bảng trừ Kho, tham chiếu chung, dữ liệu cá nhân; bảng danh tính chỉ dòng của mình", () => {
    expect(sql).toContain("as restrictive for all to authenticated");
    expect(sql).toContain("c.relname not like 'lab\\_supply\\_%'");
    for (const t of ["organizations", "departments", "permissions", "roles", "role_permissions", "notifications", "personal_workspace_items", "sidebar_pinned_items"]) expect(sql).toContain(`'${t}'`);
    expect(sql).toContain("array['profiles', 'user_roles', 'user_permissions', 'user_scopes', 'department_user_roles']");
    expect(sql).toContain("user_id = (select auth.uid())");
  });
  it("hàm áp chính sách chỉ service_role gọi được, idempotent (drop policy if exists), và được chạy trong migration", () => {
    expect(sql).toContain("drop policy if exists qlcl_kho_only_block");
    expect(sql).toContain("revoke all on function public.qlcl_apply_kho_only_isolation_v1() from public, anon, authenticated;");
    expect(sql.trim().endsWith("select public.qlcl_apply_kho_only_isolation_v1();")).toBe(true);
  });
  it("mọi bảng có RLS trong các migration của repo (trừ lab_supply_*) đều thuộc diện được áp: nhắc chạy lại hàm khi thêm bảng mới", () => {
    expect(sql).toContain("chạy lại");
  });
});
