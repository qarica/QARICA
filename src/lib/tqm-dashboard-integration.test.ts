import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("TQM dashboard integration", () => {
  const source = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
  it("keeps unified scorecard and process map mounted", () => {
    expect(source).toContain("TqmScorecard");
    expect(source).toContain("TqmProcessMap");
  });
  it("reuses operational Plan, Indicator, Monitoring, Finding, CAPA and Incident data", () => {
    for (const token of ["vw_program_progress","indicator_measurements","monitoring_rounds","findings","capas","incidents"]) expect(source).toContain(token);
  });
  it("keeps Risk and Report obligations in the Smart Command Center orchestration", () => {
    const smart = readFileSync("src/components/tqm-smart-command-center.tsx", "utf8");
    for (const token of ['from("risks")','from("reporting_obligations")','href: "/risks"','href: "/reports"']) {
      expect(smart).toContain(token);
    }
    expect(smart).toContain("riskReviewDue");
    expect(smart).toContain("reportOverdue");
  });
  it("scopes the dashboard to the active work year", () => {
    expect(source).toContain("getWorkYear");
    expect(source).toContain('.eq("work_year",year)');
  });
});
