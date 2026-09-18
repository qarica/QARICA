import { describe, expect, it } from "vitest";
import { QLCL_RECURRING_BLUEPRINTS, findRecurringBlueprint } from "./qlcl-recurring-blueprints";

describe("QLCL recurring blueprints", () => {
  it("keeps every source code unique", () => {
    const codes = QLCL_RECURRING_BLUEPRINTS.map((item) => item.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("covers the operating handbook jobs plus source-backed monitoring/reporting", () => {
    expect(QLCL_RECURRING_BLUEPRINTS).toHaveLength(33);
    expect(findRecurringBlueprint("HN-01")?.cadence).toBe("DAILY");
    expect(findRecurringBlueprint("N-09")?.cadence).toBe("YEARLY");
  });

  it("does not silently invent a precise date when the source only gives a window", () => {
    expect(findRecurringBlueprint("HTh-01")?.scheduleNeedsChoice).toBe(true);
    expect(findRecurringBlueprint("N-05")?.scheduleNeedsChoice).toBe(true);
  });

  it("maps KSK H2 to a monthly source-backed report without inventing the submission method", () => {
    const item = findRecurringBlueprint("KSK-H2-2026");
    expect(item?.automationKind).toBe("REPORT");
    expect(item?.monthDay).toBe(15);
    expect(item?.endDate).toBe("2026-12-15");
    expect(item?.automationReportRecipient).toBe("Sở Y tế");
    expect(item?.automationReportMethod).toBeUndefined();
  });

  it("maps existing quality reports to report outputs", () => {
    expect(findRecurringBlueprint("HTh-05")?.automationKind).toBe("REPORT");
    expect(findRecurringBlueprint("HQ-05")?.automationKind).toBe("REPORT");
  });

  it("maps the fall-risk source to the published checklist code and hospital-wide area", () => {
    const item = findRecurringBlueprint("GS-TRUOTNGA-2026");
    expect(item?.automationKind).toBe("MONITORING");
    expect(item?.automationChecklistCode).toBe("BANGKIEM_TRUOTNGA.V1_QLCL.01");
    expect(item?.automationTargetArea).toContain("Tòa A");
  });
});
