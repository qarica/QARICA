import { describe, expect, it } from "vitest";
import { detectDecliningTrend } from "./indicator-trend-warning";

const verified = (period_end: string, calculated_value: number) => ({
  period_end,
  calculated_value,
  workflow_status: "VERIFIED",
});

describe("detectDecliningTrend", () => {
  it("flags 3 consecutive worsening periods for HIGHER_IS_BETTER even while still in target", () => {
    const rows = [verified("2026-01-31", 95), verified("2026-02-28", 90), verified("2026-03-31", 85)];
    const result = detectDecliningTrend(rows, "HIGHER_IS_BETTER");
    expect(result.declining).toBe(true);
    expect(result.periods.map((p) => p.value)).toEqual([95, 90, 85]);
  });

  it("flags 3 consecutive worsening periods for LOWER_IS_BETTER (value rising is worse)", () => {
    const rows = [verified("2026-01-31", 1.2), verified("2026-02-28", 1.8), verified("2026-03-31", 2.5)];
    expect(detectDecliningTrend(rows, "LOWER_IS_BETTER").declining).toBe(true);
  });

  it("does not flag when the trend improves or is flat", () => {
    const rows = [verified("2026-01-31", 80), verified("2026-02-28", 82), verified("2026-03-31", 82)];
    const result = detectDecliningTrend(rows, "HIGHER_IS_BETTER");
    expect(result.declining).toBe(false);
    expect(result.reason).toBe("not_declining");
  });

  it("does not flag when a single period breaks the decline", () => {
    const rows = [
      verified("2026-01-31", 95),
      verified("2026-02-28", 90),
      verified("2026-03-31", 92),
      verified("2026-04-30", 85),
    ];
    // window of 3 most recent evaluable periods: 90, 92, 85 -> not monotonically worse
    expect(detectDecliningTrend(rows, "HIGHER_IS_BETTER").declining).toBe(false);
  });

  it("ignores DRAFT/SUBMITTED periods not yet VERIFIED or LOCKED", () => {
    const rows = [
      verified("2026-01-31", 95),
      verified("2026-02-28", 90),
      { period_end: "2026-03-31", calculated_value: 999, workflow_status: "SUBMITTED" },
    ];
    const result = detectDecliningTrend(rows, "HIGHER_IS_BETTER");
    expect(result.reason).toBe("insufficient_data");
  });

  it("treats a null calculated_value as missing, not as 0 (JS Number(null)===0 pitfall)", () => {
    const rows = [
      verified("2026-01-31", 95),
      verified("2026-02-28", 90),
      { period_end: "2026-03-31", calculated_value: null, workflow_status: "VERIFIED" },
    ];
    const result = detectDecliningTrend(rows, "HIGHER_IS_BETTER");
    expect(result.reason).toBe("insufficient_data");
  });

  it("returns insufficient_data with fewer than 3 evaluable periods", () => {
    const rows = [verified("2026-01-31", 95), verified("2026-02-28", 90)];
    const result = detectDecliningTrend(rows, "HIGHER_IS_BETTER");
    expect(result.declining).toBe(false);
    expect(result.reason).toBe("insufficient_data");
  });

  it("skips TARGET_RANGE and NEUTRAL directions as not evaluable", () => {
    const rows = [verified("2026-01-31", 95), verified("2026-02-28", 90), verified("2026-03-31", 85)];
    expect(detectDecliningTrend(rows, "TARGET_RANGE").reason).toBe("direction_not_evaluable");
    expect(detectDecliningTrend(rows, "NEUTRAL").reason).toBe("direction_not_evaluable");
    expect(detectDecliningTrend(rows, null).reason).toBe("direction_not_evaluable");
  });

  it("sorts unsorted input by period_end before evaluating", () => {
    const rows = [verified("2026-03-31", 85), verified("2026-01-31", 95), verified("2026-02-28", 90)];
    expect(detectDecliningTrend(rows, "HIGHER_IS_BETTER").declining).toBe(true);
  });
});
