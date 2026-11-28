import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Khuôn Kho hóa chất áp cho Khắc phục & CAPA: tab theo luồng việc trong trang + 1 thanh "Cần xử lý" + ô chỉ số bấm để lọc +
// Danh sách/Kanban. Gộp phần trùng, không xóa trang hay nội dung nào.
describe("Khắc phục & CAPA theo khuôn Kho hóa chất", () => {
  const bar = readFileSync("src/components/corrective-workspace-bar.tsx", "utf8");
  const capa = readFileSync("src/app/(app)/capa/page.tsx", "utf8");
  const findings = readFileSync("src/app/(app)/findings/page.tsx", "utf8");

  it("thanh dùng chung có đủ 5 bước của luồng việc và thanh Cần xử lý", () => {
    for (const label of ["Phát hiện", "CAPA đang xử lý", "Đánh giá hiệu lực", "Đã đóng", "Phân tích"]) expect(bar).toContain(`label: "${label}"`);
    expect(bar).toContain("<strong>Cần xử lý</strong>");
    expect(findings).toContain('topSlot={<CorrectiveWorkspaceBar active="findings" year={year} />}');
    expect(capa).toContain("<CorrectiveWorkspaceBar active={tab} year={year}/>");
  });

  it("danh sách 'CAPA cần xử lý' cũ gộp vào bảng (xếp theo việc cần làm, có cột Việc tiếp theo), không còn 2 danh sách lặp", () => {
    expect(capa).not.toContain("<h2>CAPA CẦN XỬ LÝ</h2>");
    expect(capa).toContain("<th>Việc tiếp theo</th>");
    expect(capa).toContain("actionRank(a,today)-actionRank(b,today)");
  });

  it("biểu đồ và phân tích không bị xóa hay gập: chuyển sang tab Phân tích, hiện sẵn", () => {
    expect(capa).toContain('{tab==="analytics"?<section className="grid"><article className="panel"><div className="head"><h2>Xu hướng CAPA theo tháng</h2>');
    expect(capa).toContain('<section className="capa-analytics">');
    expect(capa).not.toContain('<details className="panel capa-analytics">');
  });

  it("ô chỉ số bấm để lọc và có trạng thái đang chọn; có Danh sách/Kanban trên cùng dữ liệu", () => {
    expect(capa).toContain('href="/capa?status=ROOT_CAUSE_ANALYSIS" active={status==="ROOT_CAUSE_ANALYSIS"}');
    expect(capa).toContain('className="capa-view-toggle"');
    expect(capa).toContain('className="capa-kanban"');
  });

  it("Finding quá hạn trong thanh Cần xử lý lọc đúng danh sách, cùng cách tính với Dashboard", () => {
    expect(bar).toContain('href: "/findings?overdue=1"');
    expect(findings).toContain("countOverdueFindings([x], today) === 1");
  });
});
