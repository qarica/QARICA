import { describe, expect, it } from "vitest";
import { INDICATOR_2026_BLUEPRINT, blueprintResolution } from "./indicator-2026-blueprint";
import { expectedIndicatorPeriods } from "./indicator-periods";

describe("indicator 2026 source blueprint", () => {
  it("matches exact approved codes when the definition is unambiguous", () => {
    const item = INDICATOR_2026_BLUEPRINT.find((row) => row.key === "hand-hygiene")!;
    const result = blueprintResolution(item, [
      { id: "1", code: "CSCL-02", name: "Tỉ lệ nhân viên y tế tuân thủ vệ sinh tay" },
      { id: "2", code: "OTHER", name: "Chỉ số khác" },
    ]);
    expect(result.status).toBe("MATCHED");
    expect(result.candidate?.id).toBe("1");
  });

  it("does not guess when patient satisfaction has multiple valid definitions", () => {
    const item = INDICATOR_2026_BLUEPRINT.find((row) => row.key === "patient-satisfaction")!;
    const result = blueprintResolution(item, [
      { id: "1", code: "CSCL-09", name: "Tỉ lệ hài lòng của người bệnh ngoại trú" },
      { id: "2", code: "CSCL-10", name: "Tỉ lệ hài lòng của người bệnh nội trú" },
    ]);
    expect(result.status).toBe("AMBIGUOUS");
    expect(result.matches).toHaveLength(2);
  });
});

describe("indicator period generation", () => {
  it("starts the 2026 pilot at Q4 and does not backfill earlier quarters", () => {
    expect(expectedIndicatorPeriods({
      workYear: 2026,
      frequency: "QUARTERLY",
      activeFrom: "2026-10-01",
      throughDate: "2026-10-01",
    })).toEqual([{ key: "2026-Q4", label: "Quý 4/2026", start: "2026-10-01", end: "2026-12-31" }]);
  });

  it("materializes monthly periods only through the month already started", () => {
    const periods = expectedIndicatorPeriods({
      workYear: 2026,
      frequency: "MONTHLY",
      activeFrom: "2026-10-01",
      throughDate: "2026-11-18",
    });
    expect(periods.map((row) => row.key)).toEqual(["2026-M10", "2026-M11"]);
  });

  it("creates nothing before the configured activation date", () => {
    expect(expectedIndicatorPeriods({
      workYear: 2026,
      frequency: "MONTHLY",
      activeFrom: "2026-10-01",
      throughDate: "2026-09-18",
    })).toHaveLength(0);
  });
});
