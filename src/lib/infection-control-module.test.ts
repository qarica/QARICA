import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Module mới theo yêu cầu tường minh: "Kiểm soát nhiễm khuẩn" — mảng bắt
// buộc trong Bộ tiêu chí chất lượng bệnh viện, trước đây QARICA chưa có
// module riêng. Phạm vi đã chốt tường minh: Giám sát nhiễm khuẩn bệnh viện
// (HAI) + Giám sát vệ sinh tay — KHÔNG làm riêng phơi nhiễm nghề nghiệp/kim
// đâm (dùng chung module Sự cố & Phản ánh đã có, tránh trùng lặp nghiệp vụ).
describe("Migration: infection_control_cases + hand_hygiene_audits", () => {
  const migration = read("supabase/migrations/20261119000000_infection_control_v1.sql");

  it("tạo bảng infection_control_cases, bật RLS theo organization_id, khai báo quyền module riêng", () => {
    expect(migration).toContain("create table if not exists public.infection_control_cases");
    expect(migration).toContain("alter table public.infection_control_cases enable row level security");
    expect(migration).toContain("organization_id = (select organization_id from public.profiles where user_id = auth.uid())");
    expect(migration).toContain("'infection_control.view'");
    expect(migration).toContain("'infection_control.manage'");
  });

  it("status giới hạn đúng 3 trạng thái (nghi ngờ/xác nhận/đã xử lý)", () => {
    expect(migration).toContain("status text not null default 'NGHI_NGO' check (status in ('NGHI_NGO','XAC_NHAN','DA_XU_LY'))");
  });

  it("tạo bảng hand_hygiene_audits, bật RLS, ràng buộc số lần tuân thủ không vượt số cơ hội quan sát ngay ở DB", () => {
    expect(migration).toContain("create table if not exists public.hand_hygiene_audits");
    expect(migration).toContain("alter table public.hand_hygiene_audits enable row level security");
    expect(migration).toContain("constraint hand_hygiene_compliant_le_observed check (opportunities_compliant <= opportunities_observed)");
  });

  it("neo quyền mặc định vào Đo lường & Giám sát (monitoring.view/monitoring.perform) — hoạt động IPC gần nhất với giám sát QLCL đang làm", () => {
    expect(migration).toContain("p_old.code='monitoring.view'");
    expect(migration).toContain("p_old.code='monitoring.perform'");
  });
});

describe("API /api/infection-control/cases — ranh giới view/manage nhất quán", () => {
  it("GET danh sách dùng infection_control.view, lọc theo organization_id", () => {
    const route = read("src/app/api/infection-control/cases/route.ts");
    expect(route).toContain('requireApiPermission("infection_control.view")');
    expect(route).toContain('.eq("organization_id", organizationId)');
  });

  it("POST tạo mới dùng infection_control.manage, validate ngày phát hiện/vị trí nhiễm khuẩn/trạng thái, ghi audit_logs", () => {
    const route = read("src/app/api/infection-control/cases/route.ts");
    expect(route).toContain('requireApiPermission("infection_control.manage")');
    expect(route).toContain("Ngày phát hiện không hợp lệ");
    expect(route).toContain("Vị trí nhiễm khuẩn là bắt buộc");
    expect(route).toContain('action_type: "INFECTION_CONTROL_CASE_CREATE"');
  });

  it("PATCH sửa dùng infection_control.manage, xác nhận ca thuộc đúng tổ chức trước khi cho sửa", () => {
    const route = read("src/app/api/infection-control/cases/[id]/route.ts");
    expect(route).toContain('requireApiPermission("infection_control.manage")');
    expect(route).toContain("existing.organization_id !== organizationId");
    expect(route).toContain('action_type: "INFECTION_CONTROL_CASE_UPDATE"');
  });
});

describe("API /api/infection-control/hand-hygiene — validate số liệu tuân thủ không vượt số cơ hội quan sát ở cả API lẫn DB (2 lớp)", () => {
  it("POST từ chối opportunities_compliant > opportunities_observed", () => {
    const route = read("src/app/api/infection-control/hand-hygiene/route.ts");
    expect(route).toContain('requireApiPermission("infection_control.manage")');
    expect(route).toContain("Số lần tuân thủ không thể lớn hơn số cơ hội quan sát");
  });

  it("PATCH tính lại ràng buộc dựa trên giá trị hiệu lực (mới hoặc cũ), không chỉ validate khi cả 2 field cùng được gửi lên", () => {
    const route = read("src/app/api/infection-control/hand-hygiene/[id]/route.ts");
    expect(route).toContain("const effectiveObserved = has(\"opportunities_observed\") ? nonNegativeInt(body.opportunities_observed) : existing.opportunities_observed;");
    expect(route).toContain("const effectiveCompliant = has(\"opportunities_compliant\") ? nonNegativeInt(body.opportunities_compliant) : existing.opportunities_compliant;");
  });
});

describe("Trang /infection-control và /infection-control/hand-hygiene, điều hướng", () => {
  it("cả 2 page.tsx chặn truy cập bằng infection_control.view trước khi tải dữ liệu", () => {
    const casesPage = read("src/app/(app)/infection-control/page.tsx");
    const hhPage = read("src/app/(app)/infection-control/hand-hygiene/page.tsx");
    expect(casesPage).toContain('requirePermission(user, "infection_control.view")');
    expect(hhPage).toContain('requirePermission(user, "infection_control.view")');
  });

  it("navigation.ts có nhóm Kiểm soát nhiễm khuẩn với 2 mục con, gắn đúng quyền xem", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('id: "infection-control"');
    expect(nav).toContain('label: "Kiểm soát nhiễm khuẩn"');
    expect(nav).toContain('href: "/infection-control"');
    expect(nav).toContain('href: "/infection-control/hand-hygiene"');
    expect(nav).toContain('permission: "infection_control.view"');
  });

  it("icon.tsx có icon droplets dùng cho Giám sát vệ sinh tay", () => {
    const icon = read("src/components/icon.tsx");
    expect(icon).toContain("Droplets");
    expect(icon).toContain('"droplets":Droplets');
  });
});

describe("infection-control-cases-client.tsx và hand-hygiene-audits-client.tsx — đúng quy ước UI chung của repo", () => {
  it("cả 2 client đều bọc bảng trong .table-wrap, modal title bọc trong .modal-head", () => {
    for (const path of ["src/components/infection-control-cases-client.tsx", "src/components/hand-hygiene-audits-client.tsx"]) {
      const client = read(path);
      expect(client).toContain('<div className="table-wrap">');
      expect(client).toMatch(/className="modal-card[^"]*"[\s\S]{0,40}<div className="modal-head">/);
    }
  });

  it("mã bệnh nhân chỉ ghi mã nội bộ, không thu thập tên/CCCD (QARICA không thao tác hồ sơ bệnh nhân)", () => {
    const client = read("src/components/infection-control-cases-client.tsx");
    expect(client).toContain("Mã nội bộ, không ghi tên/CCCD");
  });

  it("tỷ lệ tuân thủ vệ sinh tay tính trực tiếp từ 2 số nguyên (không lưu cột tính sẵn, tránh lệch dữ liệu), tô màu theo ngưỡng WHO", () => {
    const client = read("src/components/hand-hygiene-audits-client.tsx");
    expect(client).toContain("function complianceTone(rate: number): \"danger\" | \"warning\" | \"success\" {");
    expect(client).toContain("if (rate < 50) return \"danger\";");
    expect(client).toContain("if (rate < 80) return \"warning\";");
  });
});
