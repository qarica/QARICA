import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sự cố & Phản ánh theo cùng khuôn Kho hóa chất / Khắc phục & CAPA: tab theo luồng việc + thanh Cần xử lý + ô chỉ số bấm để lọc
// + Danh sách/Kanban. Gộp phần trùng, không xóa trang hay nội dung nào.
describe("Sự cố & Phản ánh theo khuôn Kho hóa chất", () => {
  const bar = readFileSync("src/components/safety-workspace-bar.tsx", "utf8");
  const inc = readFileSync("src/app/(app)/incidents/page.tsx", "utf8");
  const table = readFileSync("src/components/incident-registry-table.tsx", "utf8");

  it("thanh dùng chung có đủ luồng việc, mỗi tab theo đúng quyền của trang đích, dùng chung khuôn WorkspaceFlowBar", () => {
    for (const label of ["Sự cố đang xử lý", "Điều tra / RCA", "Đã đóng", "Phản ánh / Góp ý", "Bài học / Cảnh báo", "Phân tích"]) expect(bar).toContain(`label: "${label}"`);
    expect(bar).toContain("<WorkspaceFlowBar ");
    expect(bar).toContain('export const SAFETY_ALERT_PERMISSIONS = ["safety_alert.view", "safety_alert.edit", "safety_alert.publish"];');
    expect(readFileSync("src/app/(app)/feedback/page.tsx", "utf8")).toContain('topSlot={<SafetyWorkspaceBar active="feedback" year={year} />}');
    expect(readFileSync("src/app/(app)/safety-alerts/page.tsx", "utf8")).toContain('<SafetyWorkspaceBar active="lessons" year={year} />');
    expect(inc).toContain("<SafetyWorkspaceBar active={tab} year={year}/>");
  });

  it("cảnh báo 'chưa phân loại mức tổn hại' và danh sách 'Hồ sơ cần chú ý' gộp vào thanh Cần xử lý và bảng (không còn khối lặp)", () => {
    expect(inc).not.toContain("<h2>Hồ sơ cần chú ý</h2>");
    expect(inc).not.toContain('<div className="alert warning"><strong>{unclassified}');
    expect(bar).toContain('href: "/incidents?filter=unclassified"');
    expect(table).toContain("<th>Việc tiếp theo</th>");
    expect(inc).toContain("const tabRows=attentionRows.filter(");
  });

  it("biểu đồ không bị xóa hay gập: chuyển sang tab Phân tích; ô chỉ số bấm để lọc; có Kanban", () => {
    expect(inc).toContain('{tab==="analytics"&&!filter?<section className="grid"><article className="panel"><div className="head"><h2>Xu hướng sự cố');
    expect(inc).toContain('href="/incidents?filter=serious" active={filter==="serious"}');
    expect(inc).toContain('className="inc-kanban"');
  });

  it("số sự cố nghiêm trọng đang mở dùng chung cách tính với Dashboard", () => {
    expect(bar).toContain("countSeriousOpenIncidents(incidents)");
  });
});
