import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Vai trò 1 — Chuyên gia QLCL: 6 Trung bình + 1 Thấp từ báo cáo thẩm định.
describe("QLCL TB/Thấp batch", () => {
  it("FMEA is_high_priority is auto-raised from baseline RPN >= 125, not left to a pre-score manual tick alone", () => {
    const migration = read("supabase/migrations/20261026_fmea_rpn_auto_high_priority_v1.sql");
    expect(migration).toContain("v_rpn_high_threshold constant integer := 125");
    expect(migration).toContain("if v_type='BASELINE' and v_rpn>=v_rpn_high_threshold and not v_mode.is_high_priority then");
    expect(migration).toContain("update public.fmea_failure_modes set is_high_priority=true");
    const client = read("src/components/fmea-workflow-client.tsx");
    expect(client).toContain("router.refresh()");
  });

  it("RCA completeness requires Five Whys (>=3) for SEVERE/DEATH incidents, not just when the investigator happened to start one", () => {
    const route = read("src/app/api/incidents/[id]/rca/route.ts");
    expect(route).toContain('harm_status,serious_event_flag');
    expect(route).toContain('const isSeriousEvent = !!incident.serious_event_flag || ["SEVERE", "DEATH"].includes(String(incident.harm_status));');
    expect(route).toContain("const deepAnalysisRequired = isSeriousEvent || deepAnalysisUsed;");
    expect(route).toContain("deep_analysis_required: deepAnalysisRequired");

    const client = read("src/components/incident-rca-workspace-client.tsx");
    expect(client).toContain("setDeepAnalysisRequired(!!json.deep_analysis_required)");
    expect(client).toContain("const requireDeepAnalysis = deepAnalysisRequired || counts.whys > 0;");
  });

  it("a CAPA reopened by a non-EFFECTIVE review keeps the PARTIALLY_EFFECTIVE vs INEFFECTIVE distinction visible instead of collapsing both into an unlabeled IN_PROGRESS", () => {
    const panel = read("src/components/domain-workflow-panel.tsx");
    expect(panel).toContain('supabase.from("capa_effectiveness_reviews").select("result").eq("capa_id", capa.id).order("review_no", { ascending: false }).limit(1).maybeSingle()');
    expect(panel).toContain("latestEffectivenessResult={latestReview?.result || null}");

    const client = read("src/components/capa-workflow-client.tsx");
    expect(client).toContain("EFFECTIVENESS_RESULT_LABEL");
    expect(client).toContain('effectivenessReviewCount>0&&latestEffectivenessResult&&latestEffectivenessResult!=="EFFECTIVE"');
  });

  it("criteria publish can validate the active items' total max_score against an expected value before PUBLISHED", () => {
    const migration = read("supabase/migrations/20261026_criteria_publish_max_score_check_v1.sql");
    expect(migration).toContain("p_expected_total_score numeric default null");
    expect(migration).toContain("if p_expected_total_score is not null then");
    expect(migration).toContain("if v_computed_total_score is distinct from p_expected_total_score then");

    const route = read("src/app/api/criteria-sets/[id]/publish/route.ts");
    expect(route).toContain("p_expected_total_score:expectedTotalScore");

    const client = read("src/components/criteria-set-editor-client.tsx");
    expect(client).toContain("expected_total_score:expectedTotalScore");
  });

  it("Action verification (individual and department) blocks the same person who submitted from also being the verifier", () => {
    const individual = read("supabase/migrations/20261026_action_verify_self_block_v1.sql");
    expect(individual).toContain("if v_action.assignment_target_type='USER' and v_action.assignee_user_id=p_actor_user_id then");

    const department = read("supabase/migrations/20261026_action_department_verify_self_block_v1.sql");
    expect(department).toContain("if v_submitted_by is not null and v_submitted_by = p_actor_user_id then");
  });

  it("a TRIAGED incident (skipped investigation/RCA) cannot close on an Action with no evidence of its own, not just generic incident-level evidence", () => {
    const route = read("src/app/api/incidents/[id]/workflow/route.ts");
    expect(route).toContain("} else if (ids.length > 0 && !noActionRequired) {");
    expect(route).toContain('.from("evidence_links").select("id", { count: "exact", head: true }).in("record_id", ids)');
  });
});
