import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/(app)/tasks/page.tsx", "utf8");
const closed = new Set(["COMPLETED", "CANCELLED", "CLOSED", "DONE", "NOT_APPLICABLE"]);

describe("Operations task KPI eligibility", () => {
  it("does not count finished work as due today or upcoming", () => {
    const rows = [
      { workflow_status: "COMPLETED", days_to_due: 0, is_overdue: false },
      { workflow_status: "OPEN", days_to_due: 0, is_overdue: false },
      { workflow_status: "DONE", days_to_due: 2, is_overdue: false },
      { workflow_status: "OPEN", days_to_due: 2, is_overdue: false },
      { workflow_status: "OPEN", days_to_due: null, is_overdue: false },
    ];
    const active = rows.filter(row => !closed.has(row.workflow_status));
    expect(active.filter(row => row.days_to_due !== null && row.days_to_due === 0)).toHaveLength(1);
    expect(active.filter(row => row.days_to_due !== null && row.days_to_due > 0 && row.days_to_due <= 7)).toHaveLength(1);
  });

  it("uses active rows for due date and overdue KPIs", () => {
    expect(source).toContain("const activeKpiRows=kpiRows.filter");
    expect(source).toContain("dueToday=activeKpiRows.filter");
    expect(source).toContain("dueSoon=activeKpiRows.filter");
    expect(source).toContain("const overdue7=activeKpiRows.filter");
  });
});
