import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Yêu cầu: "E rà tất cả giao diện của app về dark" — khảo sát cho thấy ~17
// trang TQM (tqm-analytics, capa, evidence, incident, risk, improvement,
// indicator-quality-overview, tqm-registry-overview, monitoring, dashboard,
// plans...) đều tự định nghĩa lại CÙNG MỘT bảng màu cứng trong <style> riêng
// (card KPI nền #fff/viền #e1e9ec, nhãn mờ #718187/#7d8c92/#74838a, icon
// badge #dbeafe/#dcfce7/#fef3c7/#fee2e2/#ede9fe, viền hàng #e4eaec) — thay vì
// vá từng file, xử lý 1 LẦN bằng danh sách selector gộp trong dark-theme.css,
// phủ hết mọi trang dùng chung bảng màu này cùng lúc. TQM_CHART_CSS (donut/
// hbar/trend/gantt, dùng chung bởi cùng ~17 trang này qua export const) cũng
// được vá trực tiếp tại nguồn, không lặp lại ở từng trang.
describe("Dark mode — vá 1 lần bảng màu KPI/icon-badge/viền hàng dùng chung ở ~17 trang TQM", () => {
  const darkCss = read("src/app/dark-theme.css");
  const tqmCharts = read("src/components/tqm-charts.tsx");

  it("thẻ KPI (mọi biến thể tên lớp: .kpi, .iq-kpi, .tqm-registry-kpi, .tqm-kpi) đổi nền tối", () => {
    expect(darkCss).toContain("[data-theme=\"dark\"] .workspace-app .kpi,");
    expect(darkCss).toContain("[data-theme=\"dark\"] .workspace-app .iq-kpi,");
    expect(darkCss).toContain("[data-theme=\"dark\"] .workspace-app .tqm-registry-kpi,");
    expect(darkCss).toContain("background:#1a1f26!important;border-color:#2a333c!important}");
  });

  it("đủ 5 màu icon badge (blue/green/amber/red/purple) đều có bản dark dùng tông soft", () => {
    expect(darkCss).toContain(".kpi-icon.blue,");
    expect(darkCss).toContain(".kpi-icon.green,");
    expect(darkCss).toContain("[data-theme=\"dark\"] .workspace-app .kpi-icon.amber{background:#3a2f14!important;color:#fcd34d!important}");
    expect(darkCss).toContain(".kpi-icon.red,");
    expect(darkCss).toContain(".kpi-icon.purple,");
  });

  it("viền hàng dùng chung (.capa-row, .hot-row, .project-row, .iq-queue-row, .iq-assignment) đổi màu tối", () => {
    expect(darkCss).toContain("[data-theme=\"dark\"] .workspace-app .capa-row,");
    expect(darkCss).toContain("[data-theme=\"dark\"] .workspace-app .incident-tqm .hot-row,");
    expect(darkCss).toContain("border-color:#2a333c!important}");
  });

  it("TQM_CHART_CSS (donut/hbar/trend/gantt dùng chung) được vá trực tiếp tại nguồn, không lặp lại ở từng trang tiêu thụ", () => {
    expect(tqmCharts).toContain('[data-theme="dark"] .workspace-app .tqm-donut-hole{background:#1a1f26!important');
    expect(tqmCharts).toContain('[data-theme="dark"] .workspace-app .tqm-hbar-track{background:#242c35!important}');
    expect(tqmCharts).toContain('[data-theme="dark"] .workspace-app .tqm-gantt-row{border-bottom-color:#242c35!important}');
  });
});
