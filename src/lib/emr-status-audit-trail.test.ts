import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for an approved gap: EMR item status changes (TODO/IN_PROGRESS/
// DONE/BLOCKED) had no "who changed what, from what, when" trail — only
// created_at/updated_at on the row itself. Reuses the SAME audit_logs table
// every other module already writes to directly from its API route (see
// src/app/api/criteria-items/[id]/route.ts, src/app/api/plans/[id]/route.ts
// for the identical pattern), rather than a new EMR-specific history table.
// /admin/audit-log already reads audit_logs generically by table_name/row_id
// (falling back from record_id, which EMR rows don't have), so no new UI was
// needed for this to become visible.
describe("EMR item status transitions — audit trail", () => {
  const route = readFileSync("src/app/api/emr/items/[id]/route.ts", "utf8");

  it("writes to the shared audit_logs table, not a new EMR-specific history table", () => {
    expect(route).toContain('.from("audit_logs").insert(');
    expect(route).toContain('table_name: "emr_rollout_items"');
    expect(route).toContain("row_id: id");
  });

  it("only logs a transition when status actually changed, never on every PATCH", () => {
    expect(route).toContain("body.status !== existing.status");
  });

  it("records both the old and new status so a reader can see what it changed FROM, not just what it is now", () => {
    expect(route).toContain("old_value: { status: existing.status }");
    expect(route).toContain("new_value: { status: body.status }");
  });

  it("records who made the change via actor_user_id (the authenticated caller, not a guessed/omitted actor)", () => {
    expect(route).toContain("actor_user_id: auth.user.id");
  });

  it("surfaces an audit-write failure instead of silently losing the trail — the item update already succeeded, so this is reported as a partial failure, not swallowed", () => {
    expect(route).toContain("Đã cập nhật nhưng không ghi được audit trail");
  });

  it("the generic admin audit log viewer needs no changes — it already resolves table_name+row_id for rows without a record_id", () => {
    const adminPage = readFileSync("src/app/(app)/admin/audit-log/page.tsx", "utf8");
    expect(adminPage).toContain("r.table_name");
    expect(adminPage).toContain("r.row_id");
  });
});
