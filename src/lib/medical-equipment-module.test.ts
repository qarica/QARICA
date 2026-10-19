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
