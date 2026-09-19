import { describe, expect, it } from "vitest";
import {
  arePdsaMilestonesComplete,
  canDeletePdsaMilestone,
  canEditPdsaMilestone,
  canEditSmartObjective,
  existingImprovementColumn,
  isDateWithinProject,
  isPdsaLearningComplete,
  isValidActDecision,
  isValidPdsaPhase,
  normalizeProjectMilestone,
  normalizeProjectObjective,
  normalizedImprovementText,
  pdsaMilestoneTargetStatus,
} from "./improvement-project-setup";

describe("Improvement project setup helpers", () => {
  it("normalizes SMART objectives across compatible column names", () => {
    expect(normalizeProjectObjective({ id: "o1", objective_no: 2, objective_statement: "Giảm tỷ lệ trễ", indicator_name: "Tỷ lệ trễ", baseline_value: 18, target_value: 8, unit: "%", due_date: "2026-12-31" })).toEqual({ id: "o1", order: 2, statement: "Giảm tỷ lệ trễ", indicator: "Tỷ lệ trễ", baseline: "18", target: "8", unit: "%", due_date: "2026-12-31" });
  });
  it("normalizes PDSA milestones including structured learning fields", () => {
    expect(normalizeProjectMilestone({ id: "m1", milestone_no: 1, milestone_name: "Thử nghiệm tại Khoa A", phase: "STUDY", start_date: "2026-10-01", due_date: "2026-10-15", workflow_status: "COMPLETED", notes: "Pilot nhỏ", study_result: "Giảm còn 8%", learning_summary: "Biểu mẫu mới giảm trễ", act_decision: null })).toEqual({ id: "m1", order: 1, title: "Thử nghiệm tại Khoa A", phase: "STUDY", description: "Pilot nhỏ", start_date: "2026-10-01", end_date: "2026-10-15", status: "COMPLETED", study_result: "Giảm còn 8%", learning_summary: "Biểu mẫu mới giảm trễ", act_decision: null });
  });
  it("validates PDSA phases, Act decisions and project date boundaries", () => {
    expect(isValidPdsaPhase("study")).toBe(true); expect(isValidPdsaPhase("check")).toBe(false); expect(isValidActDecision("adapt")).toBe(true); expect(isValidActDecision("continue")).toBe(false); expect(isDateWithinProject("2026-10-15", "2026-10-01", "2026-10-31")).toBe(true); expect(isDateWithinProject("2026-11-01", "2026-10-01", "2026-10-31")).toBe(false);
  });
  it("requires completed Study learning and Act decision before evaluation", () => {
    expect(isPdsaLearningComplete([{ phase: "STUDY", status: "COMPLETED", study_result: "8%", learning_summary: "Có cải thiện" }, { phase: "ACT", status: "COMPLETED", act_decision: "ADOPT" }])).toBe(true);
    expect(isPdsaLearningComplete([{ phase: "STUDY", status: "COMPLETED", study_result: "8%", learning_summary: null }, { phase: "ACT", status: "COMPLETED", act_decision: "ADOPT" }])).toBe(false);
    expect(isPdsaLearningComplete([{ phase: "STUDY", status: "COMPLETED", study_result: "8%", learning_summary: "Có cải thiện" }, { phase: "ACT", status: "COMPLETED", act_decision: null }])).toBe(false);
  });
  it("normalizes Vietnamese text for duplicate checks", () => { expect(normalizedImprovementText("  Giảm   thời gian chờ ")).toBe("giảm thời gian chờ"); });
  it("locks SMART objective edits after draft", () => { expect(canEditSmartObjective("DRAFT")).toBe(true); expect(canEditSmartObjective("PENDING_APPROVAL")).toBe(false); expect(canEditSmartObjective("APPROVED")).toBe(false); expect(canEditSmartObjective("IN_PROGRESS")).toBe(false); });
  it("allows planned PDSA milestone edits during delivery but deletion only in draft", () => { expect(canEditPdsaMilestone("DRAFT", "PLANNED")).toBe(true); expect(canEditPdsaMilestone("APPROVED", "PLANNED")).toBe(true); expect(canEditPdsaMilestone("IN_PROGRESS", "PLANNED")).toBe(true); expect(canEditPdsaMilestone("IN_PROGRESS", "COMPLETED")).toBe(false); expect(canEditPdsaMilestone("EVALUATED", "PLANNED")).toBe(false); expect(canDeletePdsaMilestone("DRAFT", "PLANNED")).toBe(true); expect(canDeletePdsaMilestone("APPROVED", "PLANNED")).toBe(false); });
  it("enforces milestone lifecycle only while the project is in progress", () => { expect(pdsaMilestoneTargetStatus("IN_PROGRESS", "PLANNED", "START")).toBe("IN_PROGRESS"); expect(pdsaMilestoneTargetStatus("IN_PROGRESS", "IN_PROGRESS", "COMPLETE")).toBe("COMPLETED"); expect(pdsaMilestoneTargetStatus("IN_PROGRESS", "IN_PROGRESS", "RESET")).toBe("PLANNED"); expect(pdsaMilestoneTargetStatus("IN_PROGRESS", "COMPLETED", "REOPEN")).toBe("PLANNED"); expect(pdsaMilestoneTargetStatus("APPROVED", "PLANNED", "START")).toBeNull(); expect(pdsaMilestoneTargetStatus("IN_PROGRESS", "COMPLETED", "COMPLETE")).toBeNull(); });
  it("requires at least one milestone and all milestones completed before project evaluation", () => { expect(arePdsaMilestonesComplete([])).toBe(false); expect(arePdsaMilestonesComplete(["COMPLETED", "COMPLETED"])).toBe(true); expect(arePdsaMilestonesComplete(["COMPLETED", "IN_PROGRESS"])).toBe(false); expect(arePdsaMilestonesComplete(["PLANNED"])).toBe(false); });
  it("selects only columns that actually exist in a legacy-compatible row", () => { const row = { objective_statement: "A", due_date: "2026-12-31", description: "B" }; expect(existingImprovementColumn(row, ["objective_text", "objective_statement", "objective"])).toBe("objective_statement"); expect(existingImprovementColumn(row, ["description", "notes"], ["description"])).toBeNull(); });
});
