import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Rủi ro & FMEA theo cùng khuôn Kho hóa chất: tab theo luồng việc + thanh Cần xử lý + ô chỉ số bấm để lọc + Danh sách/Kanban.
// Gộp phần trùng, không xóa trang hay nội dung nào.
describe("Rủi ro & FMEA theo khuôn Kho hóa chất", () => {
  const bar = readFileSync("src/components/risk-workspace-bar.tsx", "utf8");
  const risks = readFileSync("src/app/(app)/risks/page.tsx", "utf8");

  it("thanh dùng chung đủ luồng việc và có mặt ở cả 3 trang", () => {
    for (const label of ["Rủi ro đang mở", "Đánh giá & xử lý", "Theo dõi & rà soát", "Đã ngừng", "FMEA / HFMEA", "Thang điểm", "Phân tích"]) expect(bar).toContain(`label: "${label}"`);
    expect(bar).toContain("<WorkspaceFlowBar ");
    expect(risks).toContain("<RiskWorkspaceBar active={tab} year={year}/>");
    expect(readFileSync("src/app/(app)/fmea/page.tsx", "utf8")).toContain('topSlot={<RiskWorkspaceBar active="fmea" year={year} />}');
    expect(readFileSync("src/app/(app)/risks/score-tool/page.tsx", "utf8")).toContain('<RiskWorkspaceBar active="score" year={year} />');
  });

  it("heatmap và biểu đồ không bị xóa: chuyển sang tab Phân tích; bảng có cột Việc tiếp theo; có Kanban; ô chỉ số bấm để lọc", () => {
    expect(risks).toContain('{tab==="analytics"&&!filter?<section className="grid"><article className="panel"><div className="head"><h2>Risk Heatmap');
    expect(risks).toContain("<th>Việc tiếp theo</th>");
    expect(risks).toContain('className="risk-kanban"');
    expect(risks).toContain('href="/risks?filter=due" active={filter==="due"}');
  });

  it("chip FMEA lọc đúng nghiên cứu theo bước", () => {
    expect(bar).toContain('href: "/fmea?stage=PENDING_APPROVAL"');
    expect(readFileSync("src/app/(app)/fmea/page.tsx", "utf8")).toContain('.eq("workflow_status", stage)');
  });
});
