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

  it("tải departments/profiles/medical_equipment qua supabase (client RLS theo tổ chức), không dùng admin client bỏ qua RLS, departments có đủ field tầng/phòng/diện tích", () => {
    const page = read("src/app/(app)/admin/org-chart/page.tsx");
    expect(page).toContain('supabase.from("departments").select("id,code,name,short_name,department_type,parent_department_id,is_active,floor_order,floor_label,room_label,area_sqm")');
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

// Báo cáo thực tế tiếp theo: "e phải vẽ sơ đồ như vầy" (đính kèm ảnh 1 sơ đồ
// mặt bằng theo tầng tham khảo của 1 bệnh viện khác) — KHÔNG hard-code mặt
// bằng bệnh viện đó vào QARICA (CLAUDE.md nguyên tắc 1: generic/configurable
// theo tổ chức), mà thêm field cấu hình chung (floor_order/floor_label/
// room_label/area_sqm) để TỪNG tổ chức tự nhập, rồi vẽ lưới theo tầng dùng
// đúng dữ liệu thật của tổ chức đang dùng QARICA.
describe("Sơ đồ bố trí theo tầng — field cấu hình mới + migration", () => {
  it("migration thêm đúng 4 cột floor_order/floor_label/room_label/area_sqm vào departments, dùng add column if not exists (an toàn chạy lại)", () => {
    const migration = read("supabase/migrations/20261122000000_department_floor_layout_v1.sql");
    expect(migration).toContain("add column if not exists floor_order integer");
    expect(migration).toContain("add column if not exists floor_label text");
    expect(migration).toContain("add column if not exists room_label text");
    expect(migration).toContain("add column if not exists area_sqm numeric");
  });

  it("trang Khoa/Phòng (admin-departments-client) cho nhập Thứ tự tầng/Tên tầng/Phòng/Diện tích, gửi đúng tên field lên API", () => {
    const client = read("src/components/admin-departments-client.tsx");
    expect(client).toContain("<span>Thứ tự tầng</span>");
    expect(client).toContain("<span>Tên tầng</span>");
    expect(client).toContain("<span>Phòng / vị trí</span>");
    expect(client).toContain("<span>Diện tích (m²)</span>");
    expect(client).toContain("floor_order:form.floorOrder.trim()===\"\"?null:Number(form.floorOrder)");
    expect(client).toContain("floor_label:form.floorLabel.trim()||null");
    expect(client).toContain("room_label:form.roomLabel.trim()||null");
    expect(client).toContain("area_sqm:form.areaSqm.trim()===\"\"?null:Number(form.areaSqm)");
  });

  it("cả POST và PATCH /api/admin/departments đều validate + lưu floor_order/floor_label/room_label/area_sqm, không chỉ 1 trong 2 route", () => {
    const postRoute = read("src/app/api/admin/departments/route.ts");
    const patchRoute = read("src/app/api/admin/departments/[id]/route.ts");
    for (const route of [postRoute, patchRoute]) {
      expect(route).toContain("Thứ tự tầng phải là số nguyên.");
      expect(route).toContain("Diện tích không hợp lệ.");
    }
    expect(postRoute).toContain("floor_order:floorOrder,floor_label:b.floor_label?String(b.floor_label).trim()||null:null,room_label:b.room_label?String(b.room_label).trim()||null:null,area_sqm:areaSqm");
    expect(patchRoute).toContain("floor_order:floorOrder,");
    expect(patchRoute).toContain("floor_label:body.floor_label?String(body.floor_label).trim()||null:null,");
  });

  it("buildFloorGroups nhóm theo floor_label, sắp xếp theo floor_order giảm dần, đơn vị chưa gắn tầng gom vào nhóm 'Chưa gắn tầng' ở cuối thay vì biến mất", () => {
    const client = read("src/components/admin-org-chart-client.tsx");
    expect(client).toContain("if (!d.floor_label) {");
    expect(client).toContain(".sort((a, b) => b.order - a.order);");
    expect(client).toContain('label: "Chưa gắn tầng"');
  });

  it("màu viền theo đúng 4 department_type đã có (không bịa phân loại mới), legend hiển thị đủ 4 mục", () => {
    const client = read("src/components/admin-org-chart-client.tsx");
    expect(client).toContain('const FLOOR_BOX_TONE_CLASS: Record<string, string> = { MANAGEMENT: "org-floor-box-mgmt", CLINICAL: "org-floor-box-clinical", PARACLINICAL: "org-floor-box-para", SUPPORT: "org-floor-box-support" };');
    expect(client).toContain('{ tone: "org-floor-box-mgmt", label: "Phòng chức năng, lãnh đạo" }');
    expect(client).toContain('{ tone: "org-floor-box-para", label: "Khoa cận lâm sàng" }');
  });

  it("khi tổ chức chưa nhập tầng/phòng cho đơn vị nào, hiện hướng dẫn thay vì khung trống/vỡ layout", () => {
    const client = read("src/components/admin-org-chart-client.tsx");
    expect(client).toContain("Chưa có đơn vị nào khai báo tầng/phòng");
  });
});
