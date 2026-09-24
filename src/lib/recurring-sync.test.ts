import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recurringOccurrences } from "./recurring-sync";

const base = {
  id: "t1",
  title: "Test",
  end_date: null,
  lead_department_id: "d1",
  assignee_user_id: "u1",
  expected_result: "Kết quả",
  evidence_requirement: "Minh chứng",
};

describe("recurringOccurrences", () => {
  it("generates weekly occurrences inside the requested horizon", () => {
    const dates = recurringOccurrences({
      ...base,
      recurrence_rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO",
      start_date: "2026-10-01",
    }, "2026-10-01", "2026-10-20");
    expect(dates).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
  });

  it("generates the selected week of each month", () => {
    const dates = recurringOccurrences({
      ...base,
      recurrence_rule: "FREQ=MONTHLY;INTERVAL=1;BYDAY=WE;BYSETPOS=2",
      start_date: "2026-10-01",
    }, "2026-10-01", "2026-12-31");
    expect(dates).toEqual(["2026-10-14", "2026-11-11", "2026-12-09"]);
  });

  it("clips monthly dates to the last day of shorter months", () => {
    const dates = recurringOccurrences({
      ...base,
      recurrence_rule: "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=31",
      start_date: "2026-01-31",
    }, "2026-01-31", "2026-03-31");
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("does not generate outside template end date", () => {
    const dates = recurringOccurrences({
      ...base,
      recurrence_rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=FR",
      start_date: "2026-10-01",
      end_date: "2026-10-10",
    }, "2026-10-01", "2026-11-30");
    expect(dates).toEqual(["2026-10-02", "2026-10-09"]);
  });
});


describe("recurring sync canonical materializer", () => {
  it("keeps group assignment fields and uses formal v5", () => {
    const source = readFileSync("src/lib/recurring-sync.ts", "utf8");
    expect(source).toContain("assignment_target_type,assignee_user_id,assignee_group_id");
    expect(source).toContain('"qlcl_materialize_recurring_run_v5"');
    expect(source).toContain('assignmentTargetType === "GROUP" ? !!template.assignee_group_id');
  });

  it("keeps the sync route on the shared helper instead of duplicate RRULE/materializer logic", () => {
    const source = readFileSync("src/app/api/calendar/recurring/sync/route.ts", "utf8");
    expect(source).toContain("syncRecurringTemplateNow");
    expect(source).not.toContain("qlcl_materialize_recurring_run_v3");
    expect(source).not.toContain("recurringOccurrences");
  });

  it("keeps REMINDER calendar-only and never routes it through the Action materializer", () => {
    const source = readFileSync("src/lib/recurring-sync.ts", "utf8");
    expect(source).toContain('automationKind === "REMINDER"');
    expect(source).toContain('status: automationKind === "REMINDER" ? "PLANNED" : "PENDING"');
    const reminderBranch = source.indexOf('if (automationKind === "REMINDER")');
    const materializer = source.indexOf('admin.rpc("qlcl_materialize_recurring_run_v5"');
    expect(reminderBranch).toBeGreaterThan(-1);
    expect(materializer).toBeGreaterThan(reminderBranch);
    expect(source.slice(reminderBranch, materializer)).toContain("continue;");
  });

  it("supports sync-all without requiring template_id", () => {
    const source = readFileSync("src/app/api/calendar/recurring/sync/route.ts", "utf8");
    expect(source).toContain('if (templateId)');
    expect(source).toContain('from("recurring_work_templates")');
    expect(source).toContain('created_reminders');
  });
});
