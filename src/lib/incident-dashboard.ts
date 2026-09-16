import { hcmMonthNumber } from "./hcm-date";

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

export { hcmMonthNumber };
