import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression found while investigating "nhiệm vụ theo kế hoạch đã xoá vẫn
// còn dữ liệu dính lại": the sidebar's global actionable-badge loop over
// vw_actions_dashboard computed `dueToday` from days_to_due alone, with no
// workflow_status check — so a CANCELLED action whose due_date happened to
// equal today still lit up the /tasks nav badge. Every other loop in this
// same effect (directives, reports, risks, capa, feedback, inspections,
// findings) already excludes terminal statuses before computing due-ness;
// the task/action loop was the one outlier missing it.
describe("Sidebar actionable badge — excludes terminal Action statuses", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");

  it("skips COMPLETED/CANCELLED/NOT_APPLICABLE actions before computing dueToday/overdue/returned, like every other loop in the same effect", () => {
    expect(shell).toContain('for (const task of (tasksRes.data ?? []) as any[]) { if (["COMPLETED", "CANCELLED", "NOT_APPLICABLE"].includes(String(task.workflow_status))) continue;');
  });
});
