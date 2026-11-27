import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("TQM dashboard integration", () => {
  const source = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
  it("Dashboard không còn dựng lại các khối TQM cũ (đã có trang riêng của từng module)", () => {
    for (const token of ["TqmSmartCommandCenter", "TqmPriorityBoard", "TqmInterventionLoop", "vw_program_progress", "monitoring_rounds"]) expect(source).not.toContain(token);
  });
  it("vẫn đọc dữ liệu vận hành thật cho cảnh báo và 5 ô chỉ số (Sự cố, CAPA, Rủi ro, Audit, Chỉ số)", () => {
    for (const token of ["indicator_measurements", "capas", "incidents", "risks", "audits"]) expect(source).toContain(token);
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
