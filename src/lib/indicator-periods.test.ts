import { describe, expect, it } from "vitest";
import { expectedIndicatorPeriods } from "./indicator-periods";

describe("indicator period generation", () => {
  it("respects quarterly activation and does not backfill earlier periods", () => {
    expect(expectedIndicatorPeriods({
      workYear: 2027,
      frequency: "QUARTERLY",
      activeFrom: "2027-04-01",
      throughDate: "2027-04-01",
    })).toEqual([{ key: "2027-Q2", label: "Quý 2/2027", start: "2027-04-01", end: "2027-06-30" }]);
  });

  it("materializes monthly periods only through the month already started", () => {
    const periods = expectedIndicatorPeriods({
      workYear: 2027,
      frequency: "MONTHLY",
      activeFrom: "2027-03-01",
      throughDate: "2027-04-18",
    });
    expect(periods.map((row) => row.key)).toEqual(["2027-M03", "2027-M04"]);
  });

  it("creates nothing before the configured activation date", () => {
    expect(expectedIndicatorPeriods({
      workYear: 2027,
      frequency: "MONTHLY",
      activeFrom: "2027-03-01",
      throughDate: "2027-02-18",
    })).toHaveLength(0);
  });
});
