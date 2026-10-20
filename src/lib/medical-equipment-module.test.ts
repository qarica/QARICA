import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Module mới theo yêu cầu tường minh: "Sổ quản lý TTBYT" — sổ tài sản thiết
// bị y tế thực tế (hãng SX, năm SX/SD, mã máy, số lưu hành, hạn hợp đồng/
// hiệu lực, khoa sử dụng), KHÁC với danh mục EMR "Thiết bị y tế"
// (emr_rollout_items, chỉ theo dõi trạng thái kết nối EMR) và KHÔNG dùng lại
// bảng emr_medical_equipment cũ đã bị thu hồi quyền truy cập
// (20260926_emr_legacy_quarantine_v1.sql).
describe("Sổ quản lý TTBYT — bảng/quyền độc lập, không trộn với EMR", () => {
  it("migration tạo bảng medical_equipment (không phải emr_medical_equipment), bật RLS theo organization_id, và khai báo quyền module riêng", () => {
    const migration = read("supabase/migrations/20261019_medical_equipment_registry_v1.sql");
    expect(migration).toContain("create table if not exists public.medical_equipment");
    expect(migration).not.toContain("create table if not exists public.emr_medical_equipment");
    expect(migration).toContain("alter table public.medical_equipment enable row level security");
    expect(migration).toContain("'medical_equipment.view'");
    expect(migration).toContain("'medical_equipment.manage'");
  });
});

describe("API /api/medical-equipment — ranh giới view/manage nhất quán", () => {
  it("GET danh sách dùng medical_equipment.view, lọc theo organization_id", () => {
    const route = read("src/app/api/medical-equipment/route.ts");
    expect(route).toContain('requireApiPermission("medical_equipment.view")');
    expect(route).toContain('.eq("organization_id", organizationId)');
  });

  it("POST tạo mới dùng medical_equipment.manage, ghi audit_logs", () => {
    const route = read("src/app/api/medical-equipment/route.ts");
    expect(route).toContain('requireApiPermission("medical_equipment.manage")');
    expect(route).toContain('action_type: "MEDICAL_EQUIPMENT_CREATE"');
  });

  it("PATCH sửa/ngưng sử dụng dùng medical_equipment.manage, xác nhận thiết bị thuộc đúng tổ chức trước khi cho sửa", () => {
    const route = read("src/app/api/medical-equipment/[id]/route.ts");
    expect(route).toContain('requireApiPermission("medical_equipment.manage")');
    expect(route).toContain("existing.organization_id !== organizationId");
    expect(route).toContain('action_type: "MEDICAL_EQUIPMENT_UPDATE"');
  });
});

describe("Trang /medical-equipment và điều hướng", () => {
  it("page.tsx chặn truy cập bằng medical_equipment.view trước khi tải dữ liệu", () => {
    const page = read("src/app/(app)/medical-equipment/page.tsx");
    expect(page).toContain('requirePermission(user, "medical_equipment.view")');
  });

  it("navigation.ts có mục Sổ quản lý TTBYT, gắn đúng quyền xem", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('id: "medical-equipment"');
    expect(nav).toContain('href: "/medical-equipment"');
    expect(nav).toContain('permission: "medical_equipment.view"');
  });
});

describe("medical-equipment-client.tsx — đúng quy ước UI chung của repo", () => {
  const client = read("src/components/medical-equipment-client.tsx");

  it("bảng danh sách bọc trong .table-wrap", () => {
    expect(client).toContain('<div className="table-wrap">');
  });

  it("tiêu đề modal bọc trong .modal-head, không đặt h2 trực tiếp trong .modal-card", () => {
    expect(client).toMatch(/className="modal-card[^"]*"[\s\S]{0,40}<div className="modal-head">/);
  });

  it("checkbox dùng class .inline-check/.switch-row, không để input trần trong label", () => {
    expect(client).toContain('<label className="inline-check">');
    expect(client).toContain('<label className="switch-row">');
    expect(client).not.toMatch(/<label>\s*<input type="checkbox"/);
  });
});

// Phản hồi thực tế: "chưa set đúng tên khoa phòng đã khai báo cấu hình" —
// department_label (text tự do từ đợt số hóa đầu tiên) để UI vẫn cho gõ tay
// thay vì chọn từ danh mục khoa/phòng đã cấu hình ở Admin, lặp lại đúng kiểu
// lệch tên đã có trong dữ liệu (CẤP CỨU/Khoa Cấp Cứu, XN/Xét nghiệm/Xét
// Nghiệm/Khoa XN...). Thêm department_id tham chiếu departments — nguồn cấu
// hình duy nhất — và chuyển UI sang dropdown, không tạo thêm biến thể tên.
describe("Sổ quản lý TTBYT: Khoa sử dụng chọn từ danh mục đã cấu hình (department_id), không gõ tay tự do nữa", () => {
  it("migration thêm department_id tham chiếu departments, backfill CHỈ các nhãn khớp rõ ràng, không ép map nhãn mơ hồ", () => {
    const migration = read("supabase/migrations/20261112_medical_equipment_department_id_v1.sql");
    expect(migration).toContain("alter table public.medical_equipment add column if not exists department_id uuid references public.departments(id);");
    expect(migration).toContain("me.department_label = 'CẤP CỨU' and d.name = 'Khoa Cấp Cứu'");
    expect(migration).not.toContain("'PM'");
    expect(migration).not.toContain("'Đang HĐ'");
  });

  it("page.tsx tải danh sách departments và truyền xuống client cùng equipment (department_id)", () => {
    const page = read("src/app/(app)/medical-equipment/page.tsx");
    expect(page).toContain('supabase.from("departments").select("id,name").eq("organization_id", user.organizationId).eq("is_active", true)');
    expect(page).toContain("department_id,department_label");
    expect(page).toContain("departments={(departmentsRes.data ?? []) as any[]}");
  });

  it("API POST/PATCH nhận department_id, xác nhận khoa/phòng thuộc đúng tổ chức trước khi gán — không còn nhận department_label tự do từ client", () => {
    const createRoute = read("src/app/api/medical-equipment/route.ts");
    expect(createRoute).toContain('.from("departments").select("id").eq("id", departmentId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();');
    expect(createRoute).toContain('"Khoa/phòng không hợp lệ."');
    expect(createRoute).not.toContain("department_label: cleanOrNull(body.department_label)");

    const patchRoute = read("src/app/api/medical-equipment/[id]/route.ts");
    expect(patchRoute).toContain('if (Object.prototype.hasOwnProperty.call(body, "department_id")) {');
    expect(patchRoute).not.toContain('if (Object.prototype.hasOwnProperty.call(body, "department_label"))');
  });

  it("UI: Khoa sử dụng là <select> theo danh mục departments, không còn <input> gõ tay; dòng cũ chưa map hiện nhãn gốc kèm badge \"chưa xác nhận\"", () => {
    const client = read("src/components/medical-equipment-client.tsx");
    expect(client).toContain('<select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>');
    expect(client).not.toContain('<input value={form.department_label}');
    expect(client).toContain('<span className="status-badge warning">chưa xác nhận</span>');
    expect(client).toContain("Chỉ hiện chưa xác nhận khoa/phòng");
  });
});
