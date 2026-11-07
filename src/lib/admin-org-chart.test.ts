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
    expect(page).toContain('supabase.from("departments").select("id,code,name,short_name,department_type,parent_department_id,is_active,floor_order,floor_label,room_label,area_sqm,bed_count,org_origin,org_summary")');
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

// Báo cáo thực tế: "Sơ đồ nên thể hiện cha con gần nhau trực quan" — trước
// đây mỗi tầng chỉ sort A-Z phẳng, cha/con cùng tầng (vd Khoa Nhi + Đơn vị
// Sơ sinh, cùng Tầng 2) bị tách rời bởi các đơn vị không liên quan xen giữa.
describe("Sơ đồ bố trí theo tầng — gom cha/con cùng tầng gần nhau trực quan", () => {
  const client = read("src/components/admin-org-chart-client.tsx");

  it("orderWithinFloor() chỉ xét quan hệ cha/con TRONG PHẠM VI CHÍNH tầng đó (idsInFloor), đặt con liền ngay sau cha bằng duyệt đệ quy visit()", () => {
    expect(client).toContain("function orderWithinFloor(depts: Department[]): Department[] {");
    expect(client).toContain("const idsInFloor = new Set(depts.map((d) => d.id));");
    expect(client).toContain("const parentInFloor = d.parent_department_id && idsInFloor.has(d.parent_department_id) ? d.parent_department_id : null;");
    expect(client).toContain("const visit = (d: Department) => {");
    expect(client).toContain("buildFloorGroups");
    expect(client).toContain("departments: orderWithinFloor(g.departments)");
    expect(client).toContain("departments: orderWithinFloor(unassigned)");
  });

  it("box con cùng tầng với cha được đánh dấu is-child-here (thụt vào, viền trái dày hơn) + tiền tố ↳, không lẫn với box độc lập", () => {
    expect(client).toContain('const parentSameFloor = !!parent && group.departments.some((x) => x.id === parent.id);');
    expect(client).toContain('parentSameFloor ? " is-child-here" : ""');
    expect(client).toContain('{parentSameFloor ? "↳ " : ""}{d.name}');
    expect(client).toContain(".org-floor-box.is-child-here { margin-left: 14px; border-left-width: 3px; background: #f8fafc; }");
  });

  it("box con có cha ở TẦNG KHÁC (không gom cạnh được) hiện gợi ý '— thuộc {tên cha}, {tầng cha}' thay vì im lặng mất quan hệ cha/con", () => {
    expect(client).toContain('{parent && !parentSameFloor ? <small className="org-floor-box-parent-hint">— thuộc {parent.name}{parent.floor_label ? `, ${parent.floor_label}` : ""}</small> : null}');
  });
});

// Báo cáo thực tế (mobile screenshot): "Ko có màu ghi chú diễn giải" — ô màu
// minh họa trong chú thích (legend) không hiện được vì class
// org-floor-box-mgmt/clinical/para/support vốn chỉ định nghĩa border-color
// (dùng cho .org-floor-box đã có sẵn border-width/style riêng) — gắn thẳng
// lên span chú thích (không có .org-floor-box) thì border-color vô hình do
// không có border nào để tô màu, ô chú thích hiện trống trơn.
describe("Sơ đồ bố trí theo tầng — ô màu chú thích (legend) phải tự có border/background riêng, không dựa vào .org-floor-box", () => {
  const client = read("src/components/admin-org-chart-client.tsx");

  it("org-floor-legend-swatch tự định nghĩa border + background mặc định, không chỉ có border-color suông", () => {
    expect(client).toContain(".org-floor-legend-swatch { display: inline-block; width: 14px; height: 14px; border-radius: 4px; margin-right: 6px; vertical-align: middle; border: 1.5px solid #cbd5e1; background: #fff; }");
  });

  it("cả 4 tone (mgmt/clinical/para/support) đều có rule riêng cho .org-floor-legend-swatch, khớp đúng border-color của .org-floor-box tương ứng", () => {
    expect(client).toContain(".org-floor-legend-swatch.org-floor-box-mgmt { border-color: #1D4ED8; background: #EEF2FF; }");
    expect(client).toContain(".org-floor-legend-swatch.org-floor-box-para { border-color: #dc2626; background: #FEE2E2; }");
    expect(client).toContain(".org-floor-legend-swatch.org-floor-box-support { border-color: #94a3b8; border-style: dashed; background: #fff; }");
  });
});

// Báo cáo thực tế: "Bổ sung sơ đồ này nữa" (ảnh sơ đồ phân cấp theo khối:
// Phòng chức năng / Khoa lâm sàng / Khoa cận lâm sàng-hỗ trợ, mỗi khoa có
// giường + nguồn gốc 2013/2018/2019) — thêm field cấu hình chung
// bed_count/org_origin/org_summary (không hard-code 1 bệnh viện), vẽ thành
// sơ đồ thứ 3 trong trang Sơ đồ tổ chức, trục màu khác với sơ đồ tầng
// (org_origin thay vì department_type).
describe("Sơ đồ phân cấp theo khối (bed_count/org_origin/org_summary)", () => {
  it("migration thêm đúng 3 cột + check constraint org_origin giới hạn đúng 3 giá trị, dùng add column if not exists", () => {
    const migration = read("supabase/migrations/20261123000000_department_org_hierarchy_v1.sql");
    expect(migration).toContain("add column if not exists bed_count integer");
    expect(migration).toContain("add column if not exists org_origin text");
    expect(migration).toContain("add column if not exists org_summary text");
    expect(migration).toContain("check (org_origin is null or org_origin in ('ESTABLISHED_2013', 'NEW_2018', 'PLAN_ONLY_2019'))");
  });

  it("cả POST và PATCH /api/admin/departments đều validate bed_count (số nguyên không âm) và org_origin (đúng 1 trong 3 giá trị)", () => {
    const postRoute = read("src/app/api/admin/departments/route.ts");
    const patchRoute = read("src/app/api/admin/departments/[id]/route.ts");
    for (const route of [postRoute, patchRoute]) {
      expect(route).toContain('const ORG_ORIGINS');
      expect(route).toContain("Số giường không hợp lệ.");
      expect(route).toContain("Nguồn gốc đơn vị không hợp lệ.");
    }
  });

  it("trang Khoa/Phòng cho nhập Số giường/Nguồn gốc/Mô tả cơ cấu, gửi đúng tên field lên API", () => {
    const client = read("src/components/admin-departments-client.tsx");
    expect(client).toContain("<span>Số giường</span>");
    expect(client).toContain("<span>Nguồn gốc</span>");
    expect(client).toContain("<span>Mô tả cơ cấu / đơn nguyên</span>");
    expect(client).toContain("bed_count:form.bedCount.trim()===\"\"?null:Number(form.bedCount)");
    expect(client).toContain("org_origin:form.orgOrigin||null");
    expect(client).toContain("org_summary:form.orgSummary.trim()||null");
  });

  it("buildHierarchyBlocks nhóm đúng 3 khối theo department_type (MANAGEMENT / CLINICAL / PARACLINICAL+SUPPORT), không bịa khối mới", () => {
    const client = read("src/components/admin-org-chart-client.tsx");
    expect(client).toContain('{ key: "MANAGEMENT", label: "Phòng chức năng, lãnh đạo", types: ["MANAGEMENT"] }');
    expect(client).toContain('{ key: "CLINICAL", label: "Khoa lâm sàng", types: ["CLINICAL"] }');
    expect(client).toContain('{ key: "PARA_SUPPORT", label: "Khoa cận lâm sàng và hỗ trợ", types: ["PARACLINICAL", "SUPPORT"] }');
  });

  it("trục màu sơ đồ phân cấp dùng org_origin (3 tone established/new/planonly), khác trục màu department_type của sơ đồ tầng — không dùng chung FLOOR_BOX_TONE_CLASS", () => {
    const client = read("src/components/admin-org-chart-client.tsx");
    expect(client).toContain('const ORIGIN_BOX_TONE_CLASS: Record<string, string> = { ESTABLISHED_2013: "org-hier-box-established", NEW_2018: "org-hier-box-new", PLAN_ONLY_2019: "org-hier-box-planonly" };');
    expect(client).toContain("ORIGIN_BOX_TONE_CLASS[d.org_origin || \"\"] || \"org-hier-box-established\"");
  });

  it("hiển thị số giường: 0 giường ghi rõ 'Không giường' (không phải im lặng/0), null thì không hiện gì (không bịa số)", () => {
    const client = read("src/components/admin-org-chart-client.tsx");
    expect(client).toContain('d.bed_count != null ? ` · ${d.bed_count === 0 ? "Không giường" : `${d.bed_count} giường`}` : ""');
  });

  it("cả 2 sơ đồ (tầng + phân cấp) luôn chiếm trọn chiều ngang (org-chart-full-width = grid-column 1/-1), không bị bó hẹp vào 1 nửa lưới 2 cột cùng cây+chi tiết", () => {
    const client = read("src/components/admin-org-chart-client.tsx");
    const fullWidthCount = (client.match(/className="panel org-chart-full-width"/g) ?? []).length;
    expect(fullWidthCount).toBe(2);
    expect(client).toContain(".org-chart-full-width { grid-column: 1 / -1; }");
  });

  it("khi chưa có đơn vị nào khai báo giường/nguồn gốc, hiện hướng dẫn thay vì khung trống", () => {
    const client = read("src/components/admin-org-chart-client.tsx");
    expect(client).toContain("Chưa có đơn vị nào khai báo số giường/nguồn gốc");
  });
});
