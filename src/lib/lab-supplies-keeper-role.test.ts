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
    expect(read("src/lib/navigation.ts")).toContain('href: "/lab-supplies", icon: "droplets", permission: "lab_supplies.view"');
  });
  it("trang đích sau đăng nhập: người không có dashboard.view được chuyển tới menu đầu tiên của họ, có chốt chống vòng lặp", () => {
    const d = read("src/app/(app)/dashboard/page.tsx");
    expect(d).toContain('!hasPermission(user, "dashboard.view") && !(await searchParams).forbidden');
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
