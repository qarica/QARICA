import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/mobile-responsive-fixes.css", "utf8");

describe("Mobile responsive fixes — dashboard/report grids reflow to one column", () => {
  it("overrides .kpi-grid, .exec-kpis and .legacy-grid3 to a single column on mobile", () => {
    expect(css).toContain(".workspace-app .kpi-grid,");
    expect(css).toContain(".workspace-app .exec-kpis,");
    expect(css).toContain(".workspace-app .legacy-grid3,");
    expect(css).toContain("flex-direction: column !important;");
  });

  it("the .legacy-grid3 override carries !important so it can beat the section's hard-coded inline 0.7fr/1.3fr style", () => {
    const dashboard = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
    expect(dashboard).toContain('style={{gridTemplateColumns:".7fr 1.3fr"}}');
    const ruleStart = css.indexOf(".workspace-app .kpi-grid,");
    const ruleBlock = css.slice(ruleStart, css.indexOf("}", ruleStart));
    expect(ruleBlock).toContain("grid-template-columns: 1fr !important");
  });

  it("fixes Đo lường & Giám sát's KPI row and donut+trend row (.iq-kpis, .iq-grid)", () => {
    expect(css).toContain(".workspace-app .iq-kpis,");
    expect(css).toContain(".workspace-app .iq-grid,");
  });

  it("fixes EMR's category readiness grid", () => {
    expect(css).toContain(".workspace-app .readiness-grid {");
  });

  it("fixes the systemic bare .kpis bug shared by Việc của tôi, Kế hoạch & Điều hành, Sự cố & Phản ánh, Rủi ro & FMEA, Cải tiến chất lượng, Kho minh chứng, Admin overview and Analytics' second KPI row", () => {
    expect(css).toContain(".workspace-app .kpis,");
  });

  it("fixes the 5 RegistryModulePage overview components sharing the identical two-column-forever defect (Đánh giá & Kiểm tra, Findings/Feedback, Directives/Reports, FMEA, and the generic registry fallback)", () => {
    for (const cls of ["cs-kpis", "av2-kpis", "ops-kpis", "rp-kpis", "tqm-registry-kpis"]) {
      expect(css).toMatch(new RegExp(`\\.workspace-app \\.${cls}\\s*[,{]`));
    }
  });

  it("out-specifies recurring-work-client's and Lịch QLCL's own already-!important 2-column overrides instead of losing the specificity tie", () => {
    expect(css).toContain(".workspace-app .recurring-work-client .kpis {");
    expect(css).toContain(".workspace-app .quality-calendar-page .kpi-grid {");
  });

  it("does not touch legitimate 7-column calendar grids (.mini-cal-grid, .calendar-grid, .calendar-week-grid)", () => {
    for (const diagramClass of ["mini-cal-grid", "calendar-grid", "calendar-week-grid"]) {
      expect(css).not.toContain(`.${diagramClass}`);
    }
  });

  it("does NOT blanket-target every *-grid class — real multi-column visualizations (calendar/gantt/heatmap) must keep their own column math", () => {
    for (const diagramClass of ["calendar-grid", "tqm-gantt-grid", "risk-heatmap-grid", "fishbone-grid", "timeline-grid"]) {
      expect(css).not.toContain(`.${diagramClass}`);
    }
  });

  it("gives grid/kpi children min-width:0 so they can actually shrink instead of forcing page-level horizontal scroll", () => {
    expect(css).toContain(".workspace-app .kpi-grid > *,");
    expect(css.match(/min-width: 0 !important;/g)?.length).toBeGreaterThan(3);
  });
});

describe("Mobile responsive fixes — Admin (and every workspace-root module) tab strip", () => {
  const workspaceShell = readFileSync("src/app/workspace-shell.css", "utf8");

  it("the base .workspace-tabs rule wraps (safe from overflow, but tall on a phone with 8 Admin tabs)", () => {
    expect(workspaceShell).toContain(".workspace-app .workspace-tabs {");
    expect(workspaceShell).toContain("flex-wrap: wrap !important;");
  });

  it("mobile override switches it to a single horizontally-scrolling row instead", () => {
    expect(css).toContain(".workspace-app .workspace-strip-inner {");
    expect(css).toContain("overflow-x: auto !important;");
    expect(css).toContain(".workspace-app .workspace-tab {\n    flex: 0 0 auto !important;\n    white-space: nowrap !important;\n    min-height: 40px !important;\n  }");
  });
});
