export const RECORD_LIFECYCLE_PERMISSION: Record<string, string> = {
  ACTION: "tasks.update",
  PROGRAM: "plans.manage",
  DIRECTIVE: "directives.manage",
  REPORT: "reports.manage",
  INSPECTION: "inspections.manage",
  INDICATOR_MEASUREMENT: "indicators.manage",
  MONITORING: "checklists.manage",
  FINDING: "findings.manage",
  INCIDENT: "incident.close",
  CAPA: "capa.manage",
  RISK: "risk.manage",
  FMEA: "risk.manage",
  IMPROVEMENT_PROPOSAL: "projects.manage",
  IMPROVEMENT_PROJECT: "projects.manage",
  ASSESSMENT: "criteria.manage",
  EXTERNAL_ASSESSMENT: "criteria.manage",
  AUDIT: "audit.manage",
  SAFETY_ALERT: "incident.close",
  FEEDBACK: "feedback.manage",
};

export function lifecyclePermissionFor(recordType: string) {
  return RECORD_LIFECYCLE_PERMISSION[recordType] || "system.manage";
}
