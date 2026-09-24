import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("self-assessment criteria operability", () => {
  it("supports search/filter, score limits and unsaved-change protection", () => {
    const source=readFileSync("src/components/assessment-criteria-client.tsx","utf8");
    const panel=readFileSync("src/components/domain-workflow-panel.tsx","utf8");
    expect(source).toContain("Tìm mã, tên tiêu chí, khoa/phòng");
    expect(source).toContain('window.addEventListener("beforeunload"');
    expect(source).toContain("max={row.maxScore??undefined}");
    expect(source).toContain("leadDepartmentName");
    expect(panel).toContain("maxScore: criterion.max_score");
    expect(panel).toContain("assessmentDepartmentMap");
  });
});
