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

  it("normalizes and deduplicates collaborative work groups", () => {
    const [task] = cleanPlanDraftActions([{
      title: "A",
      lead_department_id: "d1",
      assignee_user_id: "u1",
      due_date: "2026-12-01",
      expected_result: "B",
      collaborating_group_ids: [" g1 ", "g1", "g2", ""],
    }]);
    expect(task.collaborating_group_ids).toEqual(["g1", "g2"]);
  });

  it("migrates one legacy automation output without losing configuration", () => {
    const [task] = cleanPlanDraftActions([{
      title: "Giám sát vệ sinh tay",
      lead_department_id: "d1",
      assignee_user_id: "u1",
      due_date: "2026-12-01",
      expected_result: "B",
      automation_kind: "MONITORING",
      automation_confirmed: true,
      automation_ref_id: "checklist-v1",
      automation_target_department_id: "d2",
    }]);
    expect(task.automation_outputs).toEqual([expect.objectContaining({
      kind: "MONITORING",
      ref_id: "checklist-v1",
      target_department_id: "d2",
    })]);
  });

  it("keeps independent configuration for multiple outputs", () => {
    const [task] = cleanPlanDraftActions([{
      title: "Giám sát và báo cáo",
      lead_department_id: "d1",
      assignee_user_id: "u1",
      due_date: "2026-12-01",
      expected_result: "B",
      automation_outputs: [
        { kind: "MONITORING", ref_id: "checklist-v1", target_department_id: "d2" },
        { kind: "REPORT", report_recipient: "BGĐ", report_method: "Email", report_period: "Tháng 12/2026" },
      ],
    }]);
    expect(task.automation_outputs).toHaveLength(2);
    expect(task.automation_outputs[0]).toMatchObject({ kind: "MONITORING", ref_id: "checklist-v1" });
    expect(task.automation_outputs[1]).toMatchObject({ kind: "REPORT", report_recipient: "BGĐ" });
    expect(validatePlanDraftAction(task, "2026-01-01", "2026-12-31")).toBeNull();
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
  it("keeps legacy tasks backward compatible as ordinary actions", () => {
    const [task] = cleanPlanDraftActions([{ title: "A", lead_department_id: "d1", assignee_user_id: "u1", due_date: "2026-12-01", expected_result: "B" }]);
    expect(task.automation_kind).toBe("ACTION");
    expect(task.automation_confirmed).toBe(false);
  });

  it("requires an existing indicator assignment after indicator automation is confirmed", () => {
    const [task] = cleanPlanDraftActions([{
      title: "Theo dõi tỷ lệ",
      lead_department_id: "d1",
      assignee_user_id: "u1",
      due_date: "2026-12-01",
      expected_result: "B",
      automation_kind: "INDICATOR",
      automation_confirmed: true,
    }]);
    expect(validatePlanDraftAction(task, "2026-01-01", "2026-12-31")).toContain("Chỉ số cần chọn");
  });

  it("asks only for the missing monitoring target after a checklist is selected", () => {
    const [task] = cleanPlanDraftActions([{
      title: "Giám sát vệ sinh tay",
      lead_department_id: "d1",
      assignee_user_id: "u1",
      due_date: "2026-12-01",
      expected_result: "B",
      automation_kind: "MONITORING",
      automation_confirmed: true,
      automation_ref_id: "checklist-v1",
    }]);
    expect(validatePlanDraftAction(task, "2026-01-01", "2026-12-31")).toContain("khoa/phòng hoặc phạm vi");
  });

  it("accepts monitoring for a whole-area scope without forcing one department", () => {
    const [task] = cleanPlanDraftActions([{
      title: "Giám sát vị trí có nguy cơ trượt, ngã",
      lead_department_id: "d1",
      assignee_user_id: "u1",
      due_date: "2026-10-31",
      expected_result: "Danh mục vị trí nguy cơ",
      automation_kind: "MONITORING",
      automation_confirmed: true,
      automation_ref_id: "checklist-slip-fall-v1",
      automation_target_area: "Toàn bộ Tòa A và Tòa B",
    }]);
    expect(task.automation_target_area).toBe("Toàn bộ Tòa A và Tòa B");
    expect(validatePlanDraftAction(task, "2026-01-01", "2026-12-31")).toBeNull();
  });

  it("accepts a complete confirmed automation configuration", () => {
    const [task] = cleanPlanDraftActions([{
      title: "Giám sát vệ sinh tay",
      lead_department_id: "d1",
      assignee_user_id: "u1",
      due_date: "2026-12-01",
      expected_result: "B",
      automation_kind: "MONITORING",
      automation_confirmed: true,
      automation_ref_id: "checklist-v1",
      automation_target_department_id: "d2",
    }]);
    expect(validatePlanDraftAction(task, "2026-01-01", "2026-12-31")).toBeNull();
  });

  it("asks only for missing business-output configuration", () => {
    const base = { title: "A", lead_department_id: "d1", assignee_user_id: "u1", due_date: "2026-12-01", expected_result: "B", automation_confirmed: true };
    expect(validatePlanDraftAction(cleanPlanDraftActions([{ ...base, automation_kind: "REPORT" }])[0], null, null)).toContain("nơi nhận");
    expect(validatePlanDraftAction(cleanPlanDraftActions([{ ...base, automation_kind: "ASSESSMENT" }])[0], null, null)).toContain("bộ tiêu chí");
    expect(validatePlanDraftAction(cleanPlanDraftActions([{ ...base, automation_kind: "AUDIT" }])[0], null, null)).toContain("loại đánh giá");
    expect(validatePlanDraftAction(cleanPlanDraftActions([{ ...base, automation_kind: "IMPROVEMENT" }])[0], null, null)).toBeNull();
  });

});
