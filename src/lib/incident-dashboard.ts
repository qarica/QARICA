const CLOSED_INCIDENT = new Set(["CLOSED", "CANCELLED"]);
const INVESTIGATION_PHASE = new Set(["INVESTIGATION_REQUIRED", "INVESTIGATING", "ACTION_FOLLOW_UP", "AWAITING_CLOSURE"]);

export type IncidentAttentionLike = {
  workflow_status?: string | null;
  serious_event_flag?: boolean | null;
};

export function incidentAttentionRank(row: IncidentAttentionLike) {
  const status = String(row.workflow_status || "").toUpperCase();
  const open = !CLOSED_INCIDENT.has(status);
  const serious = Boolean(row.serious_event_flag);
  const investigation = INVESTIGATION_PHASE.has(status);
  if (open && serious && investigation) return 50;
  if (open && serious) return 40;
  if (open && investigation) return 30;
  if (open) return 20;
  if (serious) return 10;
  return 0;
}

export function hcmMonthNumber(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ho_Chi_Minh", month: "numeric" }).format(date));
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}
