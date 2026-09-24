import { describe, expect, it } from "vitest";
import { buildDepartmentBenchmark } from "./indicator-department-benchmark";

const row = (overrides: Partial<Parameters<typeof buildDepartmentBenchmark>[0][number]>) => ({
  indicator_key: "IND1",
  indicator_label: "Tỷ lệ tuân thủ vệ sinh tay",
  department_id: "dept-1",
  department_label: "Khoa Nội",
  direction: "HIGHER_IS_BETTER" as const,
  unit: "%",
  value: 90,
  period_end: "2026-03-31",
  ...overrides,
});

describe("buildDepartmentBenchmark", () => {
  it("ranks departments best-first for HIGHER_IS_BETTER", () => {
    const groups = buildDepartmentBenchmark([
      row({ department_id: "a", department_label: "Khoa A", value: 70 }),
      row({ department_id: "b", department_label: "Khoa B", value: 95 }),
      row({ department_id: "c", department_label: "Khoa C", value: 85 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].departments.map((d) => d.department_id)).toEqual(["b", "c", "a"]);
    expect(groups[0].best.department_id).toBe("b");
    expect(groups[0].worst.department_id).toBe("a");
  });

  it("ranks departments best-first for LOWER_IS_BETTER (lower value wins)", () => {
    const groups = buildDepartmentBenchmark([
      row({ department_id: "a", department_label: "Khoa A", value: 5, direction: "LOWER_IS_BETTER" }),
      row({ department_id: "b", department_label: "Khoa B", value: 1, direction: "LOWER_IS_BETTER" }),
    ]);
    expect(groups[0].best.department_id).toBe("b");
    expect(groups[0].worst.department_id).toBe("a");
  });

  it("excludes indicators with fewer than minDepartments (default 2)", () => {
    const groups = buildDepartmentBenchmark([row({ department_id: "a" })]);
    expect(groups).toHaveLength(0);
  });

  it("skips TARGET_RANGE and NEUTRAL directions", () => {
    const groups = buildDepartmentBenchmark([
      row({ department_id: "a", direction: "TARGET_RANGE" }),
      row({ department_id: "b", direction: "NEUTRAL" }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("skips rows with non-numeric or missing values", () => {
    const groups = buildDepartmentBenchmark([
      row({ department_id: "a", value: null }),
      row({ department_id: "b", value: 80 }),
    ]);
    expect(groups).toHaveLength(0); // only 1 valid dept left, below minDepartments
  });

  it("dedups multiple assignments for the same department, keeping the latest period_end", () => {
    const groups = buildDepartmentBenchmark([
      row({ department_id: "a", value: 60, period_end: "2026-01-31" }),
      row({ department_id: "a", value: 90, period_end: "2026-03-31" }),
      row({ department_id: "b", value: 70, period_end: "2026-03-31" }),
    ]);
    expect(groups[0].departments.find((d) => d.department_id === "a")?.value).toBe(90);
  });

  it("computes gapPct as relative percentage difference between best and worst", () => {
    const groups = buildDepartmentBenchmark([
      row({ department_id: "a", value: 50 }),
      row({ department_id: "b", value: 100 }),
    ]);
    expect(groups[0].gapPct).toBe(50);
  });

  it("sorts multiple indicator groups by largest gap first", () => {
    const groups = buildDepartmentBenchmark([
      row({ indicator_key: "SMALL_GAP", department_id: "a", value: 90 }),
      row({ indicator_key: "SMALL_GAP", department_id: "b", value: 88 }),
      row({ indicator_key: "BIG_GAP", department_id: "a", value: 20 }),
      row({ indicator_key: "BIG_GAP", department_id: "b", value: 95 }),
    ]);
    expect(groups[0].indicator_key).toBe("BIG_GAP");
    expect(groups[1].indicator_key).toBe("SMALL_GAP");
  });

  it("respects a custom minDepartments option", () => {
    const groups = buildDepartmentBenchmark(
      [row({ department_id: "a" }), row({ department_id: "b" })],
      { minDepartments: 3 },
    );
    expect(groups).toHaveLength(0);
  });
});
