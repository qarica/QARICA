export const OPERATIONAL_HIDDEN_STATUSES = new Set(["CANCELLED", "ARCHIVED", "INACTIVE", "RETIRED"]);

export function isOperationallyHiddenStatus(status?: string | null) {
  return OPERATIONAL_HIDDEN_STATUSES.has(String(status || "").toUpperCase());
}

export function isCancelledStatus(status?: string | null) {
  return String(status || "").toUpperCase() === "CANCELLED";
}
