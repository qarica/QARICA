import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guards = [
  "src/lib/capa-effectiveness-atomic.test.ts",
  "src/lib/feedback-finding-atomic.test.ts",
  "src/lib/feedback-transition-atomic.test.ts",
  "src/lib/feedback-close-atomic.test.ts",
  "src/lib/risk-nonterminal-atomic.test.ts",
  "src/lib/fmea-transition-atomic.test.ts",
  "src/lib/directive-transition-atomic.test.ts",
  "src/lib/safety-alert-transition-atomic.test.ts",
  "src/lib/inspection-transition-atomic.test.ts",
  "src/lib/incident-atomic-route.test.ts",
  "src/lib/notification-recipient-event-uniqueness.test.ts",
  "src/lib/indicator-runtime-generic.test.ts",
] as const;

describe("near-done A-S regression inventory", () => {
  it.each(guards)("keeps focused regression guard %s", (path) => {
    expect(readFileSync(path, "utf8").trim().length).toBeGreaterThan(0);
  });

  it("keeps Personal Reminder integrated into My Work and Calendar", () => {
    const tasks = readFileSync("src/app/(app)/tasks/page.tsx", "utf8");
    const calendar = readFileSync("src/app/(app)/calendar/page.tsx", "utf8");
    expect(tasks).toContain("PersonalReminders");
    expect(tasks).toContain('from("personal_reminders")');
    expect(calendar).toContain('"REMINDER"');
    expect(calendar).toContain('from("personal_reminders")');
  });
});
