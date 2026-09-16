export type FmeaRow = Record<string, unknown>;

export const FMEA_STEP_COLUMNS = {
  order: ["sequence_no", "step_no", "sequence_number", "step_order", "sort_order"] as const,
  label: ["step_name", "name", "process_step", "step_description", "description"] as const,
  description: ["step_description", "description", "notes"] as const,
};

export const FMEA_MODE_COLUMNS = {
  label: ["failure_mode", "failure_mode_description", "mode_name", "name", "description"] as const,
  effect: ["potential_effect", "effect", "failure_effect", "effects"] as const,
  cause: ["potential_cause", "cause", "failure_cause", "causes"] as const,
  control: ["current_controls", "current_control", "existing_controls", "controls"] as const,
  severity: ["severity_score", "severity", "s_score"] as const,
  occurrence: ["occurrence_score", "occurrence", "o_score", "probability_score"] as const,
  detection: ["detection_score", "detection", "d_score", "detectability_score"] as const,
  rpn: ["rpn", "risk_priority_number", "risk_score"] as const,
  order: ["sequence_no", "mode_no", "sort_order"] as const,
};

function firstValue(row: FmeaRow, keys: readonly string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
}

export function existingFmeaColumn(row: FmeaRow, keys: readonly string[], exclude: string[] = []) {
  return keys.find((key) => !exclude.includes(key) && Object.prototype.hasOwnProperty.call(row, key)) || null;
}

export function canEditFmeaAnalysis(status: string | null | undefined) {
  return ["DRAFT", "IN_PROGRESS"].includes(String(status || "").toUpperCase());
}

export function canDeleteFmeaAnalysis(status: string | null | undefined) {
  return String(status || "").toUpperCase() === "DRAFT";
}

export function normalizedFmeaText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

export function fmeaNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function validFmeaScore(value: unknown) {
  const number = fmeaNumber(value);
  return number !== null && Number.isInteger(number) && number >= 1 && number <= 10 ? number : null;
}

export function calculateFmeaRpn(severity: unknown, occurrence: unknown, detection: unknown) {
  const s = validFmeaScore(severity);
  const o = validFmeaScore(occurrence);
  const d = validFmeaScore(detection);
  return s !== null && o !== null && d !== null ? s * o * d : null;
}

export function normalizeFmeaStep(row: FmeaRow, index = 0) {
  const label = String(firstValue(row, FMEA_STEP_COLUMNS.label) ?? `Bước ${index + 1}`).trim();
  const descriptionValue = firstValue(row, FMEA_STEP_COLUMNS.description);
  const description = descriptionValue !== null && String(descriptionValue).trim() !== label ? String(descriptionValue).trim() : null;
  return {
    id: String(row.id ?? ""),
    order: fmeaNumber(firstValue(row, FMEA_STEP_COLUMNS.order)) ?? index + 1,
    label,
    description,
  };
}

export function normalizeFmeaFailureMode(row: FmeaRow, index = 0) {
  const severity = fmeaNumber(firstValue(row, FMEA_MODE_COLUMNS.severity));
  const occurrence = fmeaNumber(firstValue(row, FMEA_MODE_COLUMNS.occurrence));
  const detection = fmeaNumber(firstValue(row, FMEA_MODE_COLUMNS.detection));
  return {
    id: String(row.id ?? ""),
    process_step_id: String(row.process_step_id ?? ""),
    order: fmeaNumber(firstValue(row, FMEA_MODE_COLUMNS.order)) ?? index + 1,
    label: String(firstValue(row, FMEA_MODE_COLUMNS.label) ?? `Failure mode ${index + 1}`).trim(),
    effect: firstValue(row, FMEA_MODE_COLUMNS.effect) === null ? null : String(firstValue(row, FMEA_MODE_COLUMNS.effect)).trim(),
    cause: firstValue(row, FMEA_MODE_COLUMNS.cause) === null ? null : String(firstValue(row, FMEA_MODE_COLUMNS.cause)).trim(),
    control: firstValue(row, FMEA_MODE_COLUMNS.control) === null ? null : String(firstValue(row, FMEA_MODE_COLUMNS.control)).trim(),
    severity,
    occurrence,
    detection,
    rpn: fmeaNumber(firstValue(row, FMEA_MODE_COLUMNS.rpn)) ?? calculateFmeaRpn(severity, occurrence, detection),
    is_high_priority: row.is_high_priority === true,
  };
}
