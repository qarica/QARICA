import { describe, expect, it } from "vitest";
import { isDateWithinProject, isValidPdsaPhase, normalizeProjectMilestone, normalizeProjectObjective, normalizedImprovementText } from "./improvement-project-setup";

describe("Improvement project setup helpers", () => {
  it("normalizes SMART objectives across compatible column names", () => {
    expect(normalizeProjectObjective({ id: "o1", objective_no: 2, objective_statement: "Giảm tỷ lệ trễ", indicator_name: "Tỷ lệ trễ", baseline_value: 18, target_value: 8, unit: "%", due_date: "2026-12-31" })).toEqual({
      id: "o1",
      order: 2,
      statement: "Giảm tỷ lệ trễ",
      indicator: "Tỷ lệ trễ",
      baseline: "18",
      target: "8",
      unit: "%",
      due_date: "2026-12-31",
    });
  });

  it("normalizes PDSA milestones across compatible column names", () => {
    expect(normalizeProjectMilestone({ id: "m1", milestone_no: 1, milestone_name: "Thử nghiệm tại Khoa A", phase: "DO", start_date: "2026-10-01", due_date: "2026-10-15", workflow_status: "PLANNED", notes: "Pilot nhỏ" })).toEqual({
      id: "m1",
      order: 1,
      title: "Thử nghiệm tại Khoa A",
      phase: "DO",
      description: "Pilot nhỏ",
      start_date: "2026-10-01",
      end_date: "2026-10-15",
      status: "PLANNED",
    });
  });

  it("validates PDSA phases and project date boundaries", () => {
    expect(isValidPdsaPhase("study")).toBe(true);
    expect(isValidPdsaPhase("check")).toBe(false);
    expect(isDateWithinProject("2026-10-15", "2026-10-01", "2026-10-31")).toBe(true);
    expect(isDateWithinProject("2026-11-01", "2026-10-01", "2026-10-31")).toBe(false);
  });

  it("normalizes Vietnamese text for duplicate checks", () => {
    expect(normalizedImprovementText("  Giảm   thời gian chờ ")).toBe("giảm thời gian chờ");
  });
});
