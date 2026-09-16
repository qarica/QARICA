import { describe, expect, it } from "vitest";
import { canEditPlanContent, cleanPlanDraftActions, planComposerReady, validatePlanDraftAction, validPlanDateWindow } from "./plan-composer";

describe("Plan Composer V2 helpers", () => {
  it("allows plan content editing only while draft, including returned plans that return to DRAFT", () => {
    expect(canEditPlanContent("DRAFT")).toBe(true);
    expect(canEditPlanContent("PENDING_APPROVAL")).toBe(false);
    expect(canEditPlanContent("APPROVED")).toBe(false);
    expect(canEditPlanContent("IN_PROGRESS")).toBe(false);
  });

  it("normalizes draft actions without inventing required values", () => {
    const actions = cleanPlanDraftActions([{ title: "  Rà soát quy trình  ", priority: "high", lead_department_id: "d1", assignee_user_id: "u1", due_date: "2026-12-01", expected_result: "  Biên bản  " }]);
    expect(actions[0]).toMatchObject({ title: "Rà soát quy trình", priority: "HIGH", lead_department_id: "d1", assignee_user_id: "u1", due_date: "2026-12-01", expected_result: "Biên bản", is_required: true });
  });

  it("validates plan and task date windows", () => {
    expect(validPlanDateWindow("2026-01-01", "2026-12-31")).toBe(true);
    expect(validPlanDateWindow("2026-12-31", "2026-01-01")).toBe(false);
    const task = cleanPlanDraftActions([{ title: "A", lead_department_id: "d1", assignee_user_id: "u1", start_date: "2026-03-01", due_date: "2027-01-01", expected_result: "B" }])[0];
    expect(validatePlanDraftAction(task, "2026-01-01", "2026-12-31")).toContain("ngoài thời gian kế hoạch");
  });

  it("requires a complete draft bundle before submission", () => {
    expect(planComposerReady({ generalObjective: "Mục tiêu", specificObjectives: ["MT1"], requirements: "Yêu cầu", draftActions: [{ title: "A", lead_department_id: "d1", assignee_user_id: "u1", due_date: "2026-12-01", expected_result: "B" }] })).toBe(true);
    expect(planComposerReady({ generalObjective: "Mục tiêu", specificObjectives: [], requirements: "Yêu cầu", draftActions: [] })).toBe(false);
  });
});
