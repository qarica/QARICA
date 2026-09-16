import { describe, expect, it } from "vitest";
import { buildIndicatorKpi, buildProjectActionKpi, isDueOnOrBeforeToday, operationalRiskTone } from "./dashboard-kpi";

describe("dashboard KPI helpers", () => {
  it("counts only evaluable verified/locked indicator results", () => {
    const result = buildIndicatorKpi([
      { workflow_status: "VERIFIED", result_level: "MEETS_TARGET", period_end: "2026-01-31" },
      { workflow_status: "LOCKED", result_level: "OUT_OF_TARGET", period_end: "2026-01-31" },
      { workflow_status: "VERIFIED", result_level: null, period_end: "2026-01-31" },
      { workflow_status: "SUBMITTED", result_level: "MEETS_TARGET", period_end: "2026-01-31" },
    ]);
    expect(result.evaluable).toHaveLength(2);
    expect(result.inTarget).toBe(1);
    expect(result.outTarget).toBe(1);
    expect(result.percentage).toBe(50);
    expect(result.trend[0].value).toBe(50);
  });

  it("uses weighted action completion across improvement projects", () => {
    const result = buildProjectActionKpi([
      { actions: 1, completed: 1 },
      { actions: 9, completed: 0 },
    ]);
    expect(result.actions).toBe(10);
    expect(result.completed).toBe(1);
    expect(result.percentage).toBe(10);
  });

  it("treats a due date today as needing attention", () => {
    expect(isDueOnOrBeforeToday("2026-09-16", "2026-09-16")).toBe(true);
    expect(isDueOnOrBeforeToday("2026-09-17", "2026-09-16")).toBe(false);
  });

  it("marks any open critical count as risk", () => {
    expect(operationalRiskTone(0)).toBe("good");
    expect(operationalRiskTone(1)).toBe("risk");
  });
});
