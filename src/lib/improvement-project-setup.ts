export type ImprovementRow = Record<string, unknown>;

export const OBJECTIVE_COLUMNS = {
  order: ["sequence_no", "objective_no", "sort_order"] as const,
  statement: ["objective_text", "objective_statement", "objective", "name", "description"] as const,
  indicator: ["indicator_name", "measure_name", "measurement_method", "measure"] as const,
  baseline: ["baseline_value", "baseline"] as const,
  target: ["target_value", "target"] as const,
  unit: ["unit", "target_unit"] as const,
  dueDate: ["target_date", "due_date", "deadline"] as const,
};

export const MILESTONE_COLUMNS = {
  order: ["sequence_no", "milestone_no", "sort_order"] as const,
  title: ["title", "milestone_name", "name", "description"] as const,
  phase: ["pdsa_phase", "phase", "milestone_type"] as const,
  description: ["description", "notes", "detail"] as const,
  startDate: ["planned_start_date", "start_date"] as const,
  endDate: ["planned_end_date", "due_date", "planned_date", "target_date"] as const,
  status: ["status", "workflow_status", "milestone_status"] as const,
  studyResult: ["study_result"] as const,
  learningSummary: ["learning_summary"] as const,
  actDecision: ["act_decision"] as const,
};

function firstValue(row: ImprovementRow, keys: readonly string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
}

export function existingImprovementColumn(row: ImprovementRow, keys: readonly string[], exclude: string[] = []) {
  return keys.find((key) => !exclude.includes(key) && Object.prototype.hasOwnProperty.call(row, key)) || null;
}

export function canEditSmartObjective(projectStatus: string | null | undefined) {
  return String(projectStatus || "").toUpperCase() === "DRAFT";
}

export function canEditPdsaMilestone(projectStatus: string | null | undefined, milestoneStatus: string | null | undefined) {
  return ["DRAFT", "APPROVED", "IN_PROGRESS"].includes(String(projectStatus || "").toUpperCase()) && String(milestoneStatus || "PLANNED").toUpperCase() === "PLANNED";
}

export function canDeletePdsaMilestone(projectStatus: string | null | undefined, milestoneStatus: string | null | undefined) {
  return String(projectStatus || "").toUpperCase() === "DRAFT" && String(milestoneStatus || "PLANNED").toUpperCase() === "PLANNED";
}

export function pdsaMilestoneTargetStatus(projectStatus: string | null | undefined, milestoneStatus: string | null | undefined, action: string | null | undefined) {
  if (String(projectStatus || "").toUpperCase() !== "IN_PROGRESS") return null;
  const current = String(milestoneStatus || "PLANNED").toUpperCase();
  const command = String(action || "").toUpperCase();
  if (command === "START" && current === "PLANNED") return "IN_PROGRESS";
  if (command === "COMPLETE" && current === "IN_PROGRESS") return "COMPLETED";
  if (command === "RESET" && current === "IN_PROGRESS") return "PLANNED";
  if (command === "REOPEN" && current === "COMPLETED") return "PLANNED";
  return null;
}

export function arePdsaMilestonesComplete(statuses: Array<string | null | undefined>) {
  return statuses.length > 0 && statuses.every((status) => String(status || "").toUpperCase() === "COMPLETED");
}

export function isPdsaLearningComplete(milestones: Array<{ phase?: string | null; status?: string | null; study_result?: string | null; learning_summary?: string | null; act_decision?: string | null }>) {
  const completed = milestones.filter((item) => String(item.status || "").toUpperCase() === "COMPLETED");
  const studies = completed.filter((item) => String(item.phase || "").toUpperCase() === "STUDY");
  const acts = completed.filter((item) => String(item.phase || "").toUpperCase() === "ACT");
  return studies.length > 0 && acts.length > 0
    && studies.every((item) => !!String(item.study_result || "").trim() && !!String(item.learning_summary || "").trim())
    && acts.every((item) => ["ADOPT", "ADAPT", "ABANDON"].includes(String(item.act_decision || "").toUpperCase()));
}

export function normalizedImprovementText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).slice(0, 10);
}

export function normalizeProjectObjective(row: ImprovementRow, index = 0) {
  return {
    id: String(row.id ?? ""),
    order: asNumber(firstValue(row, OBJECTIVE_COLUMNS.order)) ?? index + 1,
    statement: String(firstValue(row, OBJECTIVE_COLUMNS.statement) ?? `Mục tiêu ${index + 1}`).trim(),
    indicator: firstValue(row, OBJECTIVE_COLUMNS.indicator) === null ? null : String(firstValue(row, OBJECTIVE_COLUMNS.indicator)).trim(),
    baseline: firstValue(row, OBJECTIVE_COLUMNS.baseline) === null ? null : String(firstValue(row, OBJECTIVE_COLUMNS.baseline)).trim(),
    target: firstValue(row, OBJECTIVE_COLUMNS.target) === null ? null : String(firstValue(row, OBJECTIVE_COLUMNS.target)).trim(),
    unit: firstValue(row, OBJECTIVE_COLUMNS.unit) === null ? null : String(firstValue(row, OBJECTIVE_COLUMNS.unit)).trim(),
    due_date: asDate(firstValue(row, OBJECTIVE_COLUMNS.dueDate)),
  };
}

export function normalizeProjectMilestone(row: ImprovementRow, index = 0) {
  const titleValue = firstValue(row, MILESTONE_COLUMNS.title);
  const descriptionValue = firstValue(row, MILESTONE_COLUMNS.description);
  const title = String(titleValue ?? `Milestone ${index + 1}`).trim();
  const description = descriptionValue !== null && String(descriptionValue).trim() !== title ? String(descriptionValue).trim() : null;
  const optionalText = (keys: readonly string[]) => firstValue(row, keys) === null ? null : String(firstValue(row, keys)).trim();
  return {
    id: String(row.id ?? ""),
    order: asNumber(firstValue(row, MILESTONE_COLUMNS.order)) ?? index + 1,
    title,
    phase: String(firstValue(row, MILESTONE_COLUMNS.phase) ?? "PLAN").trim().toUpperCase(),
    description,
    start_date: asDate(firstValue(row, MILESTONE_COLUMNS.startDate)),
    end_date: asDate(firstValue(row, MILESTONE_COLUMNS.endDate)),
    status: String(firstValue(row, MILESTONE_COLUMNS.status) ?? "PLANNED").trim().toUpperCase(),
    study_result: optionalText(MILESTONE_COLUMNS.studyResult),
    learning_summary: optionalText(MILESTONE_COLUMNS.learningSummary),
    act_decision: optionalText(MILESTONE_COLUMNS.actDecision)?.toUpperCase() || null,
  };
}

export function isValidPdsaPhase(value: unknown) {
  return ["PLAN", "DO", "STUDY", "ACT"].includes(String(value ?? "").trim().toUpperCase());
}

export function isValidActDecision(value: unknown) {
  return ["ADOPT", "ADAPT", "ABANDON"].includes(String(value ?? "").trim().toUpperCase());
}

export function isDateWithinProject(date: string | null, startDate: string | null, endDate: string | null) {
  if (!date) return true;
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}
