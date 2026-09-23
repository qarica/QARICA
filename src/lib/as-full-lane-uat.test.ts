import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lanes: Record<string, { title: string; files: string[] }> = {
  A: {
    title: "Nền tảng / Architecture / Traceability",
    files: ["src/lib/source-action-policy.test.ts", "src/lib/linked-action-atomic-route.test.ts"],
  },
  B: {
    title: "Kế hoạch năm / Plan",
    files: ["src/lib/plan-automation.test.ts", "src/lib/plan-composer.test.ts"],
  },
  C: {
    title: "Action / My Work / Calendar",
    files: ["src/lib/action-verify-atomic.test.ts", "src/lib/task-verification-policy.test.ts", "src/lib/calendar-assessment-milestones.test.ts"],
  },
  D: {
    title: "Bộ tiêu chí / Tự đánh giá",
    files: ["src/lib/assessment-transition-atomic.test.ts", "src/lib/external-assessment-atomic.test.ts", "src/lib/quality-record-edit.test.ts"],
  },
  E: {
    title: "Bảng kiểm / Giám sát / Audit",
    files: ["src/lib/checklist-template-create-atomic.test.ts", "src/lib/monitoring-export.test.ts", "src/lib/audit-setup.test.ts"],
  },
  F: {
    title: "Chỉ số chất lượng",
    files: ["src/lib/indicator-runtime-generic.test.ts", "src/lib/indicator-periods.test.ts", "src/lib/indicator-manage-org-guard.test.ts"],
  },
  G: {
    title: "Sự cố y khoa / TT43",
    files: ["src/lib/incident-journey.test.ts", "src/lib/incident-atomic-route.test.ts"],
  },
  H: {
    title: "Workflow sự cố / RCA",
    files: ["src/lib/incident-journey.test.ts", "src/lib/incident-lessons-policy.test.ts", "src/lib/source-action-policy.test.ts"],
  },
  I: {
    title: "Phân loại chất lượng & ATNB",
    files: ["src/lib/incident-journey.test.ts", "src/lib/incident-dashboard.test.ts"],
  },
  J: {
    title: "Dashboard sự cố",
    files: ["src/lib/incident-dashboard.test.ts", "src/lib/dashboard-kpi.test.ts"],
  },
  K: {
    title: "CAPA / Evidence / Verification / Effectiveness",
    files: ["src/lib/capa-effectiveness-atomic.test.ts", "src/lib/capa-core-transition-atomic.test.ts", "src/lib/dynamic-evidence-image-lint.test.ts"],
  },
  L: {
    title: "Risk / FMEA / Improvement",
    files: ["src/lib/risk-nonterminal-atomic.test.ts", "src/lib/fmea-transition-atomic.test.ts", "src/lib/improvement-workflow-audit.test.ts"],
  },
  M: {
    title: "Feedback / Directive / Report",
    files: ["src/lib/feedback-transition-atomic.test.ts", "src/lib/directive-transition-atomic.test.ts", "src/lib/report-transition-atomic.test.ts"],
  },
  N: {
    title: "Notifications",
    files: ["src/lib/notification-recipient-event-uniqueness.test.ts", "src/lib/notification-self-scope.test.ts", "src/lib/notification-phase-escalation.test.ts"],
  },
  O: {
    title: "UX / UI",
    files: ["src/lib/static-brand-image.test.ts", "src/lib/quality-narrative-dictation.test.ts", "src/lib/dynamic-evidence-image-lint.test.ts"],
  },
  P: {
    title: "Permission / Organization / RLS",
    files: ["src/lib/indicator-manage-org-guard.test.ts", "src/lib/notification-self-scope.test.ts", "src/lib/source-action-policy.test.ts"],
  },
  Q: {
    title: "Build / Production / Test",
    files: ["src/lib/rpc-compat.test.ts", "src/lib/near-done-regression.test.ts", "src/lib/tqm-dashboard-integration.test.ts"],
  },
  R: {
    title: "Navigation / Information Architecture",
    files: ["src/lib/navigation-route-existence.test.ts", "src/lib/tqm-dashboard-integration.test.ts"],
  },
  S: {
    title: "Smart orchestration / QARICA 360°",
    files: ["src/lib/near-done-regression.test.ts", "src/lib/source-action-policy.test.ts", "src/lib/record-lifecycle.test.ts", "src/lib/criteria-monitoring-closure.test.ts"],
  },
};

describe("A-S full-lane UAT guard inventory", () => {
  it("keeps the canonical Master Task Register lane order and meanings", () => {
    expect(Object.keys(lanes)).toEqual("ABCDEFGHIJKLMNOPQRS".split(""));
    expect(lanes.I.title).toBe("Phân loại chất lượng & ATNB");
    expect(lanes.J.title).toBe("Dashboard sự cố");
    expect(lanes.K.title).toBe("CAPA / Evidence / Verification / Effectiveness");
    expect(lanes.L.title).toBe("Risk / FMEA / Improvement");
    expect(lanes.M.title).toBe("Feedback / Directive / Report");
    expect(lanes.N.title).toBe("Notifications");
    expect(lanes.O.title).toBe("UX / UI");
    expect(lanes.P.title).toBe("Permission / Organization / RLS");
    expect(lanes.Q.title).toBe("Build / Production / Test");
    expect(lanes.R.title).toBe("Navigation / Information Architecture");
    expect(lanes.S.title).toBe("Smart orchestration / QARICA 360°");
  });

  for (const [lane, config] of Object.entries(lanes)) {
    it(`${lane} · ${config.title} has executable regression guards`, () => {
      for (const file of config.files) {
        expect(readFileSync(file, "utf8").trim().length).toBeGreaterThan(0);
      }
    });
  }
});
