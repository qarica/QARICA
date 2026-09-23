import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("assessment scoring runtime", () => {
  it("renders only the canonical criteria client", () => {
    const detail=readFileSync("src/components/domain-record-detail.tsx","utf8");
    expect(detail).not.toContain("AssessmentCriteriaPanel");
  });

  it("excludes not-applicable criteria from progress numerator and denominator", () => {
    const workflow=readFileSync("src/components/domain-workflow-panel.tsx","utf8");
    expect(workflow).toContain('String(x.applicability_status || "APPLICABLE") !== "NOT_APPLICABLE"');
    expect(workflow).toContain("applicableIds.has(x.criteria_item_id)");
    expect(workflow).toContain("const scope = applicableIds.size");
  });
});
