import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for a real reported bug: "a xóa kế hoạch [test] thì action test
// cũng phải xóa chứ đâu có dùng thật" — cancelling a Kế hoạch (PROGRAM) left
// every Action/Giám sát/Báo cáo... it had already spawned on approval
// (qlcl_approve_plan_bundle_v10) sitting ACTIVE forever, so Báo cáo & Phân
// tích QLCL kept counting phantom work from a plan that no longer exists.
// Fixed by cascading CANCEL, through the SAME generic lifecycle RPC (not a
// new bespoke mechanism), to every record qlcl_approve_plan_bundle_v10
// itself already links back to the plan via record_links
// (HAS_ACTION/HAS_OUTPUT) — covers every automation kind (Action, Indicator,
// Monitoring, Report, Assessment, Audit, Improvement) generically, since all
// of them get that same link row on creation.
describe("qlcl_change_record_lifecycle_v1 — cancelling a Plan cascades to its spawned outputs", () => {
  const migration = readFileSync("supabase/migrations/20261009_record_lifecycle_program_cascade_v3.sql", "utf8");

  it("only cascades on CANCEL of a PROGRAM record, via the existing record_links (HAS_ACTION/HAS_OUTPUT) relations", () => {
    expect(migration).toContain("elsif v_record.record_type='PROGRAM' then");
    expect(migration).toContain("select target_record_id from public.record_links");
    expect(migration).toContain("where source_record_id=p_record_id and relation_type in ('HAS_ACTION','HAS_OUTPUT')");
  });

  it("cascades by recursively calling the SAME generic lifecycle RPC on each child — not a bespoke per-table cancel", () => {
    expect(migration).toContain("perform public.qlcl_change_record_lifecycle_v1(");
    expect(migration).toContain("v_child_record_id,p_actor_user_id,'CANCEL',");
  });

  it("a child that can't be cancelled (already terminal, etc.) is skipped — never aborts the plan's own cancel", () => {
    expect(migration).toContain("exception when others then");
  });

  it("every other record_type branch and the ARCHIVE path are left untouched", () => {
    expect(migration).toContain("update public.actions set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;");
    expect(migration).toContain("update public.monitoring_rounds set workflow_status='CANCELLED' where record_id=p_record_id;");
    expect(migration).toContain("if v_record.record_type='PROGRAM' then\n      update public.work_programs set workflow_status='ARCHIVED',updated_at=v_now where record_id=p_record_id;");
  });
});
