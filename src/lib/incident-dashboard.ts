import { hcmDateKey, hcmMonthNumber } from "./hcm-date";

const CLOSED_INCIDENT = new Set(["CLOSED", "CANCELLED", "REJECTED"]);
const INVESTIGATION_PHASE = new Set(["INVESTIGATION_REQUIRED", "INVESTIGATING", "ACTION_FOLLOW_UP", "AWAITING_CLOSURE"]);

export const INCIDENT_HARM = {
  NEAR_MISS: { label: "Suýt xảy ra", classCode: "NC0", classLabel: "Suýt xảy ra / chưa đến người bệnh", serious: false },
  NO_HARM: { label: "Không tổn hại", classCode: "NC1", classLabel: "Sự cố đã xảy ra nhưng chưa gây tổn hại", serious: false },
  MILD: { label: "Nhẹ", classCode: "NC1", classLabel: "Tổn thương nhẹ", serious: false },
  MODERATE: { label: "Trung bình", classCode: "NC2", classLabel: "Có tổn hại mức trung bình", serious: false },
  SEVERE: { label: "Nặng", classCode: "NC3", classLabel: "Tổn hại nặng", serious: true },
  DEATH: { label: "Tử vong", classCode: "NC3", classLabel: "Tử vong", serious: true },
} as const;

export type IncidentHarmCode = keyof typeof INCIDENT_HARM;

export function incidentHarmClassification(value?: string | null) {
  const code = String(value || "").toUpperCase() as IncidentHarmCode;
  return INCIDENT_HARM[code] || null;
}

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

export { hcmDateKey, hcmMonthNumber };


export type IncidentDomainLinkLike = {
  record_id: string;
  domain_id: string;
};

export type QualityDomainLike = {
  id: string;
  name: string;
  sort_order?: number | null;
};

export function incidentDomainDistribution(
  incidentRecordIds: string[],
  links: IncidentDomainLinkLike[],
  domains: QualityDomainLike[],
) {
  const visible = new Set(incidentRecordIds.map(String));
  const domainMap = new Map(domains.map((domain) => [String(domain.id), domain]));
  const unique = new Set<string>();
  const countMap = new Map<string, number>();
  const linkedRecords = new Set<string>();

  for (const link of links) {
    const recordId = String(link.record_id || "");
    const domainId = String(link.domain_id || "");
    if (!visible.has(recordId) || !domainMap.has(domainId)) continue;
    const key = `${recordId}:${domainId}`;
    if (unique.has(key)) continue;
    unique.add(key);
    linkedRecords.add(recordId);
    countMap.set(domainId, (countMap.get(domainId) || 0) + 1);
  }

  const rows = Array.from(countMap.entries())
    .map(([domainId, value]) => ({
      domainId,
      label: domainMap.get(domainId)?.name || domainId,
      value,
      sortOrder: Number(domainMap.get(domainId)?.sort_order ?? 999),
    }))
    .sort((a, b) => b.value - a.value || a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "vi"));

  return {
    rows,
    linkedRecordCount: linkedRecords.size,
    unclassifiedCount: Math.max(0, visible.size - linkedRecords.size),
  };
}


export function incidentReportedSameHcmDay(occurredAt?: string | null, reportedAt?: string | null) {
  const occurred = hcmDateKey(occurredAt);
  const reported = hcmDateKey(reportedAt);
  return Boolean(occurred && reported && occurred === reported);
}
