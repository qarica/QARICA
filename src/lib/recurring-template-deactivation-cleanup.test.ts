import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for a real reported bug: the user deactivated ("Ngưng") a
// recurring work template (a fall-risk monitoring plan) but 3 future
// monitoring rounds the sync job had already materialized ahead of time (up
// to a 90-day horizon) stayed live/"Cần kiểm" forever, because toggling
// is_active only ever updated the template row and never touched what the
// sync job had already generated. Fixed by cancelling those future,
// already-materialized outputs through the SAME generic record-lifecycle
// RPC (qlcl_change_record_lifecycle_v1) every manual "Hủy" button in the app
// already uses — not a new bespoke deletion/cancellation mechanism, and
// never touching PAST runs (that's real history).
describe("Recurring work template deactivation — cleans up future generated outputs", () => {
  const route = readFileSync("src/app/api/calendar/recurring/[id]/route.ts", "utf8");

  it("defines a shared helper that cancels future generated outputs via the generic lifecycle RPC", () => {
    expect(route).toContain("async function cancelFutureGeneratedOutputs(admin: ReturnType<typeof createAdminClient>, templateId: string, actorUserId: string)");
    expect(route).toContain('.rpc("qlcl_change_record_lifecycle_v1"');
    expect(route).toContain('p_action: "CANCEL"');
  });

  it("only looks at runs on or after today (planned_date >= today) — past runs are real history, never touched", () => {
    expect(route).toContain('.gte("planned_date", today)');
  });

  it("resolves both MONITORING/REPORT outputs (generated_output_record_id) and ACTION outputs (generated_action_id -> actions.record_id) to a records.id before cancelling", () => {
    expect(route).toContain("if (run.generated_output_record_id) recordIds.add(run.generated_output_record_id);");
    expect(route).toContain('admin.from("actions").select("record_id").in("id", actionIds)');
  });

  it("is called from the quick toggle ('Ngưng' button) path when deactivating, not when activating", () => {
    expect(route).toContain("if (!nextActive) await cancelFutureGeneratedOutputs(admin, id, auth.user.id);");
  });

  it("is also called from the full-edit save path when it turns the template off, for consistency", () => {
    expect(route).toContain("if (!isActive) await cancelFutureGeneratedOutputs(admin, id, auth.user.id);");
  });
});
