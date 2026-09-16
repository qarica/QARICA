export const QUALITY_RECORD_EDIT_STATES: Record<string, Set<string>> = {
  FINDING: new Set(["OPEN", "ASSIGNED", "IN_PROGRESS", "RETURNED"]),
  CAPA: new Set(["DRAFT"]),
  RISK: new Set(["IDENTIFIED"]),
};

export function canEditQualityRecord(recordType: string, workflowStatus: string | null | undefined) {
  const states = QUALITY_RECORD_EDIT_STATES[String(recordType || "").toUpperCase()];
  return !!states && states.has(String(workflowStatus || "").toUpperCase());
}

export function cleanOptionalText(value: unknown) {
  const text = value == null ? "" : String(value).trim();
  return text || null;
}

export function cleanRequiredText(value: unknown) {
  return value == null ? "" : String(value).trim();
}

export function booleanValue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

export const CAPA_EDIT_PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"]);
