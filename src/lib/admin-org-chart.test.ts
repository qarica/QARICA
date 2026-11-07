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
// orderWithinGroup() dùng chung cho cả 2 cách nhóm (tầng/khối) — xem describe
// "2 trạng thái tầng/khối với nút chuyển đổi + animation FLIP" bên dưới.
describe("Sơ đồ bố trí — gom cha/con cùng nhóm (tầng hoặc khối) gần nhau trực quan", () => {
  const client = read("src/components/admin-org-chart-client.tsx");

  it("orderWithinGroup() chỉ xét quan hệ cha/con TRONG PHẠM VI CHÍNH nhóm đang xét (idsInGroup), đặt con liền ngay sau cha bằng duyệt đệ quy visit()", () => {
    expect(client).toContain("function orderWithinGroup(depts: Department[]): Department[] {");
    expect(client).toContain("const idsInGroup = new Set(depts.map((d) => d.id));");
    expect(client).toContain("const parentInGroup = d.parent_department_id && idsInGroup.has(d.parent_department_id) ? d.parent_department_id : null;");
    expect(client).toContain("const visit = (d: Department) => {");
    expect(client).toContain("departments: orderWithinGroup(g.departments)");
    expect(client).toContain("departments: orderWithinGroup(unassigned)");
    expect(client).toContain("departments: orderWithinGroup(departments.filter((d) => b.types.includes(d.department_type || \"\")))");
  });

  it("box con cùng nhóm với cha được đánh dấu is-child-here (thụt vào, viền trái dày hơn) + tiền tố ↳, không lẫn với box độc lập", () => {
    expect(client).toContain('const parentInGroup = !!parent && group.departments.some((x) => x.id === parent.id);');
    expect(client).toContain('parentInGroup ? " is-child-here" : ""');
    expect(client).toContain('{parentInGroup ? "↳ " : ""}{d.name}');
    expect(client).toContain(".org-floor-box.is-child-here { margin-left: 10px; border-left-width: 3px; background: #f8fafc; }");
  });

  it("box con có cha ở NHÓM KHÁC (không gom cạnh được) hiện gợi ý '— thuộc {tên cha}, {nhóm cha}' thay vì im lặng mất quan hệ cha/con", () => {
    expect(client).toContain('{parent && !parentInGroup ? <small className="org-floor-box-parent-hint">— thuộc {parent.name}{parentGroupLabel ? `, ${parentGroupLabel}` : ""}</small> : null}');
  });
});

// Báo cáo thực tế (mobile screenshot): "Ko có màu ghi chú diễn giải" — ô màu
// minh họa trong chú thích (legend) không hiện được vì class
// org-floor-box-mgmt/clinical/para/support vốn chỉ định nghĩa border-color
// (dùng cho .org-floor-box đã có sẵn border-width/style riêng) — gắn thẳng
// lên span chú thích (không có .org-floor-box) thì border-color vô hình do
// không có border nào để tô màu, ô chú thích hiện trống trơn.
describe("Sơ đồ bố trí — ô màu chú thích (legend) phải tự có border/background riêng, không dựa vào .org-floor-box", () => {
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
// bed_count/org_origin/org_summary (không hard-code 1 bệnh viện), nhập ở
// trang Khoa/Phòng.
describe("Field giường/nguồn gốc/mô tả cơ cấu (bed_count/org_origin/org_summary)", () => {
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
});

// Báo cáo thực tế: "Ko phải gộp lại mà là sơ đồ 2 trạng thái có nút chuyển
// đổi 1 là bấm vào theo khối 1 là về theo tầng. Khi bấm các khối tự di
// chuyển" — 1 panel "Sơ đồ bố trí" với 2 trạng thái (groupMode: floor/block)
// đổi qua nút Theo tầng/Theo khối, và khi đổi thì từng box tự di chuyển
// (animation FLIP qua animateGroupModeChange + useLayoutEffect) từ vị trí cũ
// sang vị trí mới, không phải load lại tĩnh. Dùng 1 trục màu department_type
// (1 chú thích duy nhất) — nguồn gốc (org_origin) và giường hiện bằng chữ
// trong box.
describe("2 trạng thái tầng/khối với nút chuyển đổi + animation FLIP", () => {
  const client = read("src/components/admin-org-chart-client.tsx");

  it("chỉ còn đúng 1 panel org-chart-full-width (không còn 2 panel riêng), tiêu đề chung 'Sơ đồ bố trí'", () => {
    const fullWidthCount = (client.match(/className="panel org-chart-full-width"/g) ?? []).length;
    expect(fullWidthCount).toBe(1);
    expect(client).toContain("<h2>Sơ đồ bố trí</h2>");
    expect(client).not.toContain("Sơ đồ bố trí theo tầng</h2>");
    expect(client).not.toContain("Sơ đồ phân cấp theo khối</h2>");
  });

  it("có toggle 'Theo tầng' / 'Theo khối' gọi animateGroupModeChange (không set trực tiếp groupMode), groups chọn đúng floorGroups hoặc blockGroups theo state", () => {
    expect(client).toContain('const [groupMode, setGroupMode] = useState<"floor" | "block">("floor");');
    expect(client).toContain('const groups = groupMode === "floor" ? floorGroups : blockGroups;');
    expect(client).toContain('onClick={() => animateGroupModeChange("floor")}>Theo tầng</button>');
    expect(client).toContain('onClick={() => animateGroupModeChange("block")}>Theo khối</button>');
  });

  it("animateGroupModeChange() chụp vị trí (getBoundingClientRect) của mọi box TRƯỚC khi đổi groupMode, lưu vào prevRectsRef theo id", () => {
    expect(client).toContain('const boxRefs = useRef<Map<string, HTMLButtonElement>>(new Map());');
    expect(client).toContain('const prevRectsRef = useRef<Map<string, DOMRect> | null>(null);');
    expect(client).toContain('function animateGroupModeChange(mode: "floor" | "block") {');
    expect(client).toContain('boxRefs.current.forEach((el, id) => rects.set(id, el.getBoundingClientRect()));');
  });

  it("sau khi React render lại (groupMode đổi), useLayoutEffect tính delta vị trí VÀ kích thước cũ/mới rồi phát animation FLIP (translate+scale ngược, reflow, rồi transition về transform:none) — chạy đủ lâu (480ms) để nhìn thấy rõ ô di chuyển lên/xuống, không chỉ snap tức thời", () => {
    expect(client).toContain("useLayoutEffect(() => {");
    expect(client).toContain("}, [groupMode, detailMode]);");
    expect(client).toContain("const sx = next.width ? prev.width / next.width : 1;");
    expect(client).toContain("const sy = next.height ? prev.height / next.height : 1;");
    expect(client).toContain('el.style.transition = "none";');
    expect(client).toContain('el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;');
    expect(client).toContain("void el.offsetHeight;");
    expect(client).toContain('el.style.transition = "transform 480ms cubic-bezier(0.22, 1, 0.36, 1)";');
  });

  it("mỗi box department gắn ref callback để đăng ký/gỡ khỏi boxRefs theo id, phục vụ animation khi box đổi nhóm (unmount/remount giữa các container khác nhau)", () => {
    expect(client).toContain("if (el) boxRefs.current.set(d.id, el);");
    expect(client).toContain("else boxRefs.current.delete(d.id);");
  });

  it("chỉ dùng 1 trục màu department_type (FLOOR_BOX_TONE_CLASS) cho box ở CẢ 2 cách nhóm — không còn ORIGIN_BOX_TONE_CLASS/bộ màu riêng cho org_origin", () => {
    expect(client).not.toContain("ORIGIN_BOX_TONE_CLASS");
    expect(client).not.toContain("org-hier-box-established");
    expect(client).not.toContain("org-hier-box-new");
    expect(client).not.toContain("org-hier-box-planonly");
    expect(client).toContain('FLOOR_BOX_TONE_CLASS[d.department_type || ""] || "org-floor-box-support"');
  });

  it("giường + nguồn gốc hiện bằng chữ trong box (không phải màu viền) — 0 giường ghi rõ 'Không giường', org_origin tra qua ORG_ORIGIN_LABEL", () => {
    expect(client).toContain('d.bed_count != null ? (d.bed_count === 0 ? "Không giường" : `${d.bed_count} giường`) : null');
    expect(client).toContain("d.org_origin ? ORG_ORIGIN_LABEL[d.org_origin] : null");
  });

  it("buildBlockGroups vẫn nhóm đúng 3 khối theo department_type (MANAGEMENT / CLINICAL / PARACLINICAL+SUPPORT), tái dùng orderWithinGroup", () => {
    expect(client).toContain('{ key: "MANAGEMENT", label: "Phòng chức năng, lãnh đạo", types: ["MANAGEMENT"] }');
    expect(client).toContain('{ key: "CLINICAL", label: "Khoa lâm sàng", types: ["CLINICAL"] }');
    expect(client).toContain('{ key: "PARA_SUPPORT", label: "Khoa cận lâm sàng và hỗ trợ", types: ["PARACLINICAL", "SUPPORT"] }');
  });

  it("gợi ý cha ở nhóm khác dùng đúng nhãn theo groupMode hiện tại (floor_label hoặc blockLabelFor), không lẫn nhãn của mode kia", () => {
    expect(client).toContain("function blockLabelFor(d: Department): string | null {");
    expect(client).toContain('const parentGroupLabel = parent ? (groupMode === "floor" ? parent.floor_label : blockLabelFor(parent)) : null;');
  });

  it("panel vẫn chiếm trọn chiều ngang (org-chart-full-width = grid-column 1/-1)", () => {
    expect(client).toContain(".org-chart-full-width { grid-column: 1 / -1; }");
  });

  it("khi ở mode 'Theo tầng' mà chưa có đơn vị nào khai báo tầng/phòng, hiện hướng dẫn thay vì khung trống (mode 'Theo khối' luôn có nội dung vì department_type luôn có sẵn)", () => {
    expect(client).toContain('const hasLayoutData = groupMode === "floor" ? hasFloorData : blockGroups.length > 0;');
    expect(client).toContain("Chưa có đơn vị nào khai báo tầng/phòng");
  });
});

// Báo cáo thực tế: "Có nên có chế độ thu gọn mở rộng ko. Gọn là chỉ thấy
// tên đơn vị. Mở rộng thì xem cả chi tiết" — "Làm luôn đi" — thêm toggle
// Gọn/Mở rộng (detailMode) độc lập với Theo tầng/Theo khối (groupMode),
// tái dùng cơ chế FLIP animation chung (animateLayoutChange) cho cả 2
// toggle vì cả 2 đều làm kích thước/vị trí ô đổi.
describe("Toggle Gọn/Mở rộng (detailMode) — ẩn/hiện chi tiết trong ô, dùng chung animation FLIP", () => {
  const client = read("src/components/admin-org-chart-client.tsx");

  it("state detailMode mặc định 'full' (giữ nguyên hành vi cũ), có toggle Gọn/Mở rộng gọi animateDetailModeChange", () => {
    expect(client).toContain('const [detailMode, setDetailMode] = useState<"compact" | "full">("full");');
    expect(client).toContain('onClick={() => animateDetailModeChange("compact")}>Gọn</button>');
    expect(client).toContain('onClick={() => animateDetailModeChange("full")}>Mở rộng</button>');
  });

  it("animateGroupModeChange và animateDetailModeChange đều dùng chung animateLayoutChange() để chụp vị trí cũ trước khi đổi state", () => {
    expect(client).toContain("function animateLayoutChange(apply: () => void) {");
    expect(client).toContain("animateLayoutChange(() => setGroupMode(mode));");
    expect(client).toContain("animateLayoutChange(() => setDetailMode(mode));");
    expect(client).toContain("}, [groupMode, detailMode]);");
  });

  it("chỉ ở detailMode 'full' mới hiện các dòng chi tiết (room/area, giường/nguồn gốc, mô tả, gợi ý cha khác nhóm) — detailMode 'compact' chỉ còn tên đơn vị", () => {
    expect(client).toContain('{detailMode === "full" ? (');
    expect(client).toContain("{placeDetails ? <small>{placeDetails}</small> : null}");
    expect(client).toContain("{orgDetails ? <small>{orgDetails}</small> : null}");
    expect(client).toContain("{d.org_summary ? <small>{d.org_summary}</small> : null}");
  });

  it("tiền tố ↳ và thụt lề cha/con cùng nhóm (is-child-here) KHÔNG phụ thuộc detailMode — vẫn hiện ở cả chế độ Gọn", () => {
    expect(client).toContain("<strong>{parentInGroup ? \"↳ \" : \"\"}{d.name}</strong>");
  });
});
