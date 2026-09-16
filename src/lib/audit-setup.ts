export function canEditAuditScope(auditStatus: string | null | undefined) {
  return String(auditStatus || "").toUpperCase() === "DRAFT";
}

export function canEditAuditSession(auditStatus: string | null | undefined, sessionStatus: string | null | undefined) {
  return String(auditStatus || "").toUpperCase() === "IN_PROGRESS" && String(sessionStatus || "PLANNED").toUpperCase() === "PLANNED";
}

export function validAuditSessionWindow(start: string | null | undefined, end: string | null | undefined) {
  if (!start) return false;
  const startMs = new Date(start).getTime();
  if (!Number.isFinite(startMs)) return false;
  if (!end) return true;
  const endMs = new Date(end).getTime();
  return Number.isFinite(endMs) && endMs > startMs;
}

export function hasAuditScopeContent(input: { departmentId?: string | null; processName?: string | null; areaName?: string | null; description?: string | null }) {
  return [input.departmentId, input.processName, input.areaName, input.description].some((value) => !!String(value || "").trim());
}
