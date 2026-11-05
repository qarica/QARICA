import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Thêm trường "Phân loại TTBYT" (A/B/C/D) theo Điều 4 Nghị định 98/2021/NĐ-CP
// (Chương II — PHÂN LOẠI TRANG THIẾT BỊ Y TẾ: A rủi ro thấp, B trung bình
// thấp, C trung bình cao, D rủi ro cao). Đã đối chiếu Nghị định 07/2023/NĐ-CP
// và Nghị định 04/2025/NĐ-CP — cả hai không sửa Điều 4/5, cấu trúc A/B/C/D
// giữ nguyên. Thông tư 57/2025/TT-BYT là một hệ thống phân loại KHÁC (Nhóm
// 1-6, phục vụ đấu thầu) — không trộn vào cột này. Trường chỉ lưu kết quả do
// người có chuyên môn QLCL tự xác định — hệ thống không tự gán phân loại.
describe("Migration: medical_equipment.risk_classification (A/B/C/D)", () => {
  it("thêm cột risk_classification (nullable) + check constraint 4 giá trị hoặc null", () => {
    const migration = read("supabase/migrations/20261116000000_medical_equipment_risk_classification_v1.sql");
    expect(migration).toContain("alter table public.medical_equipment add column if not exists risk_classification text;");
    expect(migration).toContain("check (risk_classification is null or risk_classification in ('A','B','C','D'));");
  });
});

describe("API /api/medical-equipment — risk_classification", () => {
  it("POST: validate A/B/C/D, lưu vào insert, có trong SELECT", () => {
    const route = read("src/app/api/medical-equipment/route.ts");
    expect(route).toContain('const RISK_CLASSIFICATIONS = new Set(["A", "B", "C", "D"]);');
    expect(route).toContain("Phân loại TTBYT không hợp lệ (chỉ nhận A, B, C, D).");
    expect(route).toContain("risk_classification: riskClassification,");
    expect(route).toContain("status,risk_classification,created_at,updated_at");
  });

  it("PATCH: chỉ ghi khi body có risk_classification, validate A/B/C/D hoặc null", () => {
    const route = read("src/app/api/medical-equipment/[id]/route.ts");
    expect(route).toContain('if (Object.prototype.hasOwnProperty.call(body, "risk_classification")) {');
    expect(route).toContain("Phân loại TTBYT không hợp lệ (chỉ nhận A, B, C, D).");
    expect(route).toContain("patch.risk_classification = riskClassification;");
  });
});

describe("Cả 2 page.tsx (danh sách + chi tiết) và export route đều SELECT risk_classification", () => {
  it("trang danh sách", () => {
    const page = read("src/app/(app)/medical-equipment/page.tsx");
    expect(page).toContain("status,risk_classification");
  });
  it("trang chi tiết", () => {
    const page = read("src/app/(app)/medical-equipment/[id]/page.tsx");
    expect(page).toContain("status,risk_classification");
  });
  it("export CSV", () => {
    const route = read("src/app/api/medical-equipment/export/route.ts");
    expect(route).toContain("status,risk_classification,notes");
    expect(route).toContain('"Phân loại TTBYT"');
    expect(route).toContain("e.risk_classification ?? \"\",");
  });
});

describe("Dashboard tổng quan: donut Phân loại TTBYT (A/B/C/D + chưa xác định), có nhãn 'chưa xác minh' vì là đề xuất chưa được QLCL xác nhận", () => {
  it("medical-equipment-client.tsx: tính countByClassification + unclassified trên toàn bộ initialEquipment, render donut riêng kèm nhãn chưa xác minh", () => {
    const client = read("src/components/medical-equipment-client.tsx");
    expect(client).toContain("const countByClassification: Record<RiskClassification, number> = { A: 0, B: 0, C: 0, D: 0 };");
    expect(client).toContain("let unclassified = 0;");
    expect(client).toContain("chưa xác minh");
    expect(client).toContain('{ label: "Loại A", value: dashboard.countByClassification.A, tone: "brand" }');
    expect(client).toContain('{ label: "Chưa xác định", value: dashboard.unclassified, tone: "slate" }');
  });
});

describe("UI: dropdown Phân loại TTBYT trong form, badge trong bảng, hiển thị ở trang chi tiết", () => {
  it("medical-equipment-client.tsx: 4 nhãn A/B/C/D đúng mô tả rủi ro, dropdown trong form, badge trong bảng", () => {
    const client = read("src/components/medical-equipment-client.tsx");
    expect(client).toContain('A: "Loại A — rủi ro thấp"');
    expect(client).toContain('B: "Loại B — rủi ro trung bình thấp"');
    expect(client).toContain('C: "Loại C — rủi ro trung bình cao"');
    expect(client).toContain('D: "Loại D — rủi ro cao"');
    expect(client).toContain("Phân loại TTBYT");
    expect(client).toContain('<th>Phân loại</th>');
  });

  it("medical-equipment-detail-client.tsx: hiện nhãn đầy đủ phân loại trong detail-grid", () => {
    const client = read("src/components/medical-equipment-detail-client.tsx");
    expect(client).toContain("RISK_CLASSIFICATION_LABEL[equipment.risk_classification]");
  });
});
