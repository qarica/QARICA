import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Đo lường & Giám sát, Cải tiến chất lượng, Kho minh chứng theo cùng khuôn Kho hóa chất: thanh luồng việc + Cần xử lý,
// ô chỉ số bấm để lọc, biểu đồ sang tab Phân tích (hiện sẵn), gộp phần trùng — không xóa trang/nội dung.
const read = (p: string) => readFileSync(p, "utf8");

describe("Đo lường & Giám sát", () => {
  it("thanh dùng chung cho Chỉ số, Giám sát, Tổng hợp 5S; giữ nút Quản lý chỉ số (yêu cầu cũ)", () => {
    const bar = read("src/components/measure-workspace-bar.tsx");
    for (const label of ["Chỉ số chất lượng", "Giám sát & Bảng kiểm", "Tổng hợp 5S", "Phân tích giám sát"]) expect(bar).toContain(`label: "${label}"`);
    expect(read("src/app/(app)/indicators/page.tsx")).toContain('topSlot={<MeasureWorkspaceBar active="indicators" year={year} />}');
    expect(read("src/app/(app)/indicators/page.tsx")).toContain('tabs: [{ label: "Quản lý chỉ số", href: "/indicators/catalog" }]');
    expect(read("src/app/(app)/monitoring/5s-tong-hop/page.tsx")).toContain('<MeasureWorkspaceBar active="fives" year={year} />');
    expect(bar).toContain("countOutOfTargetIndicators(meas)");
  });
  it("Giám sát dùng khuôn tiêu đề chung, ô chỉ số chung; biểu đồ sang tab Phân tích", () => {
    const mon = read("src/app/(app)/monitoring/page.tsx");
    expect(mon).not.toContain('<section className="monitoring-hero">');
    expect(mon).toContain('<PageHeader title="Giám sát & Bảng kiểm"');
    expect(mon).toContain('<KpiCard icon="badge-check" tone="green" label="Tỷ lệ mục đạt"');
    expect(mon).toContain('{tab==="analytics"?<><section className="tqm-grid">');
  });
});

describe("Cải tiến chất lượng", () => {
  it("thanh dùng chung cho Đề xuất và Đề án; 'cần can thiệp' tính chung một hàm với trang", () => {
    const bar = read("src/components/improvement-workspace-bar.tsx");
    const page = read("src/app/(app)/improvement/projects/page.tsx");
    for (const label of ["Đề xuất cải tiến", "Tất cả đề án", "Đang triển khai", "Đã đánh giá / đóng", "Phân tích"]) expect(bar).toContain(`label: "${label}"`);
    expect(bar).toContain("isProjectDelayed(");
    expect(page).toContain("isProjectDelayed(");
    expect(read("src/app/(app)/improvement/proposals/page.tsx")).toContain('topSlot={<ImprovementWorkspaceBar active="proposals" year={year} />}');
  });
  it("hàng chip trạng thái trùng tab đã gộp; biểu đồ sang tab Phân tích; ô chỉ số bấm để lọc", () => {
    const page = read("src/app/(app)/improvement/projects/page.tsx");
    expect(page).not.toContain("STATUS_FILTERS.map(");
    expect(page).toContain("{isAnalytics?<section className=\"grid\">");
    expect(page).toContain('href="/improvement/projects?status=attention" active={selectedStatus==="attention"}');
  });
});

describe("Kho minh chứng", () => {
  it("tab Minh chứng / Phân tích + Cần xử lý; lưới lối tắt gộp vào dòng Quản lý theo quá trình", () => {
    const ev = read("src/app/(app)/evidence/page.tsx");
    expect(ev).toContain('<WorkspaceFlowBar ariaLabel="Luồng việc Kho minh chứng"');
    expect(ev).not.toContain('<section className="module-shortcuts-grid">');
    expect(ev).toContain('label: "Việc của tôi — nộp minh chứng từ Action", href: "/tasks"');
    expect(ev).toContain('href="/evidence?filter=pending" active={filter==="pending"}');
  });
});
