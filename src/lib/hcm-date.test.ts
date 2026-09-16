import { describe, expect, it } from "vitest";
import { hcmMonthNumber } from "./hcm-date";

describe("HCM date helpers", () => {
  it("uses Asia/Ho_Chi_Minh at UTC month boundaries", () => {
    expect(hcmMonthNumber("2026-01-31T16:59:59Z")).toBe(1);
    expect(hcmMonthNumber("2026-01-31T17:00:00Z")).toBe(2);
    expect(hcmMonthNumber("2026-09-30T17:30:00Z")).toBe(10);
  });

  it("returns null for empty or invalid values", () => {
    expect(hcmMonthNumber(null)).toBeNull();
    expect(hcmMonthNumber("not-a-date")).toBeNull();
  });
});
