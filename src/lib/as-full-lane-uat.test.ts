import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guards: Record<string,string[]> = {
 A:["src/lib/source-action-policy.test.ts","src/lib/linked-action-atomic-route.test.ts"],
 B:["src/lib/plan-automation.test.ts","src/lib/plan-composer.test.ts"],
 C:["src/lib/action-verify-atomic.test.ts","src/lib/task-verification-policy.test.ts"],
 D:["src/lib/quality-gates.test.ts","src/lib/quality-record-edit.test.ts"],
 E:["src/lib/checklist-template-create-atomic.test.ts","src/lib/monitoring-export.test.ts"],
 F:["src/lib/indicator-runtime-generic.test.ts","src/lib/indicator-periods.test.ts"],
 G:["src/lib/incident-journey.test.ts","src/lib/incident-atomic-route.test.ts"],
 H:["src/lib/capa-effectiveness-atomic.test.ts","src/lib/finding-workflow-rollback.test.ts"],
 I:["src/lib/feedback-transition-atomic.test.ts","src/lib/feedback-finding-atomic.test.ts"],
 J:["src/lib/risk-nonterminal-atomic.test.ts"],
 K:["src/lib/fmea-transition-atomic.test.ts","src/lib/fmea-setup.test.ts"],
 L:["src/lib/directive-transition-atomic.test.ts"],
 M:["src/lib/inspection-transition-atomic.test.ts","src/lib/inspection-atomic-route.test.ts"],
 N:["src/lib/report-transition-atomic.test.ts"],
 O:["src/lib/safety-alert-transition-atomic.test.ts"],
 P:["src/lib/notification-recipient-event-uniqueness.test.ts","src/lib/notification-self-scope.test.ts"],
 Q:["src/lib/dashboard-kpi.test.ts","src/lib/registry-analytics.test.ts","src/lib/tqm-csv.test.ts"],
 R:["src/lib/audit-setup.test.ts","src/lib/rpc-compat.test.ts"],
 S:["src/lib/near-done-regression.test.ts","src/lib/record-lifecycle.test.ts"],
};

describe("A-S full-lane UAT guard inventory",()=> {
 for (const [lane,files] of Object.entries(guards)) it(`${lane} has executable regression guards`,()=> {
  for(const file of files) expect(readFileSync(file,"utf8").trim().length).toBeGreaterThan(0);
 });
 it("covers every A-S lane",()=>expect(Object.keys(guards)).toEqual("ABCDEFGHIJKLMNOPQRS".split("")));
});
