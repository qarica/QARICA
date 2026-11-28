import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Đánh giá & Kiểm tra theo cùng khuôn Kho hóa chất: thanh luồng việc + Cần xử lý dùng chung cho 4 trang.
describe("Đánh giá & Kiểm tra theo khuôn Kho hóa chất", () => {
  const bar = readFileSync("src/components/assessment-workspace-bar.tsx", "utf8");

  it("thanh dùng chung có đủ 4 trang, gắn vào cả 4 trang", () => {
    for (const label of ["Tự đánh giá", "Đánh giá ngoài", "Audit / Tracer", "Tiếp đoàn"]) expect(bar).toContain(`label: "${label}"`);
    expect(bar).toContain("<WorkspaceFlowBar ");
    for (const [page, active] of [["assessments", "self"], ["external-assessments", "external"], ["audits", "audit"], ["inspections", "inspection"]]) {
      expect(readFileSync(`src/app/(app)/${page}/page.tsx`, "utf8")).toContain(`topSlot={<AssessmentWorkspaceBar active="${active}" year={year} />}`);
    }
  });

  it("giữ yêu cầu cũ: Bộ tiêu chí vào bằng nút 'Quản lý bộ tiêu chí', không thành tab riêng", () => {
    expect(bar).not.toContain('label: "Bộ tiêu chí"');
    expect(readFileSync("src/app/(app)/assessments/page.tsx", "utf8")).toContain('tabs: [{label:"Quản lý bộ tiêu chí",href:"/assessments/catalog"}]');
  });

  it("mục Cần xử lý lọc đúng danh sách ở trang đích", () => {
    expect(bar).toContain('href: "/audits?attention=soon"');
    expect(readFileSync("src/app/(app)/audits/page.tsx", "utf8")).toContain('assessmentAttentionRecordIds("audit", attention)');
  });
});
