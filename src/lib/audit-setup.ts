export function canEditAuditScope(auditStatus: string | null | undefined) {
  return String(auditStatus || "").toUpperCase() === "DRAFT";
}

export function canEditAuditSession(auditStatus: string | null | undefined, sessionStatus: string | null | undefined) {
  return String(auditStatus || "").toUpperCase() === "IN_PROGRESS" && String(sessionStatus || "PLANNED").toUpperCase() === "PLANNED";
}

export function hcmLocalInputToIso(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const date = new Date(hasZone ? text : `${text}+07:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function validAuditSessionWindow(start: string | null | undefined, end: string | null | undefined) {
  const startIso = hcmLocalInputToIso(start);
  if (!startIso) return false;
  if (!end) return true;
  const endIso = hcmLocalInputToIso(end);
  return !!endIso && new Date(endIso).getTime() > new Date(startIso).getTime();
}

export function hasAuditScopeContent(input: { departmentId?: string | null; processName?: string | null; areaName?: string | null; description?: string | null }) {
  return [input.departmentId, input.processName, input.areaName, input.description].some((value) => !!String(value || "").trim());
}
