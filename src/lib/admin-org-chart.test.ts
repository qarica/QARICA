import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Báo cáo thực tế: "nên làm thêm trong menu cấu hình 1 cái sơ đồ tổ chức,
// rồi khi bấm vào từng đơn vị sẽ hiện thông tin ... nhân sự, trang thiết
// bị, giường, bàn khám, rồi DVKT" — làm giai đoạn 1 trước: cây khoa/phòng
// theo parent_department_id (đã sửa đúng ở các request trước) + ghép Nhân
// sự (profiles.primary_department_id) và Trang thiết bị
// (medical_equipment.department_id) đã có sẵn trong hệ thống, chưa thêm
// field mới (quyết định thành lập/giường/bàn khám/DVKT để giai đoạn 2).
describe("Sơ đồ tổ chức (giai đoạn 1) — /admin/org-chart", () => {
  it("trang tồn tại, đòi quyền departments.manage giống trang Khoa/Phòng", () => {
    const page = read("src/app/(app)/admin/org-chart/page.tsx");
    expect(page).toContain('requirePermission(user, "departments.manage")');
  });

  it("tải departments/profiles/medical_equipment qua supabase (client RLS theo tổ chức), không dùng admin client bỏ qua RLS", () => {
    const page = read("src/app/(app)/admin/org-chart/page.tsx");
    expect(page).toContain('supabase.from("departments").select("id,code,name,short_name,department_type,parent_department_id,is_active")');
    expect(page).toContain('supabase.from("profiles").select("user_id,full_name,email,job_title,primary_department_id,is_active").eq("is_active", true)');
    expect(page).toContain('supabase.from("medical_equipment").select("id,equipment_name,model_code,status,department_id")');
    expect(page).not.toContain("createAdminClient");
  });

  it("thêm tab 'Sơ đồ tổ chức' vào workspace /admin, cùng quyền departments.manage với tab Khoa/Phòng", () => {
    const nav = read("src/lib/workspace-navigation.ts");
    expect(nav).toContain('{ label: "Sơ đồ tổ chức", href: "/admin/org-chart", icon: "network", permission: "departments.manage" }');
  });

  it("client component dựng cây theo parent_department_id, lọc nhân sự/thiết bị theo đơn vị đang chọn", () => {
    const client = read("src/components/admin-org-chart-client.tsx");
    expect(client).toContain("const parentId = d.parent_department_id && byId.has(d.parent_department_id) ? d.parent_department_id : null;");
    expect(client).toContain("const staff = selected ? people.filter((p) => p.primary_department_id === selected.id)");
    expect(client).toContain("const assets = selected ? equipment.filter((e) => e.department_id === selected.id)");
  });

  it("không dùng <style jsx> cho component có hàm đệ quy render tree (renderNode) — đúng gotcha CLAUDE.md về scope styled-jsx qua helper function", () => {
    const client = read("src/components/admin-org-chart-client.tsx");
    expect(client).toContain("function renderNode(node: TreeNode, depth: number)");
    expect(client).not.toContain("<style jsx>");
    expect(client).toContain("<style>{`");
  });

  it("có toggle 'Hiện đơn vị đã ngưng', nhất quán với trang Khoa/Phòng (admin-departments-client) thay vì ẩn hẳn không cho xem", () => {
    const client = read("src/components/admin-org-chart-client.tsx");
    expect(client).toContain("Hiện đơn vị đã ngưng");
  });
});
