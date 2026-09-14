const MANAGE_PERMISSIONS: Record<string, string[]> = {
  DIRECTIVE: ["directives.manage"],
  REPORT: ["reports.manage"],
  INSPECTION: ["inspections.manage", "plans.manage"],
  INDICATOR_MEASUREMENT: ["indicators.manage"],
  FINDING: ["findings.manage"],
  INCIDENT: ["incident.triage", "incident.investigate"],
  CAPA: ["capa.manage"],
  RISK: ["risk.manage"],
  FMEA: ["risk.manage"],
  IMPROVEMENT_PROPOSAL: ["projects.manage"],
  IMPROVEMENT_PROJECT: ["projects.manage"],
  ASSESSMENT: ["criteria.manage"],
  EXTERNAL_ASSESSMENT: ["criteria.review", "criteria.manage"],
  AUDIT: ["audit.manage"],
  SAFETY_ALERT: ["incident.investigate", "incident.close"],
  FEEDBACK: ["feedback.manage"],
};

export function actionCreatePermissions(recordType: string) {
  return Array.from(new Set(MANAGE_PERMISSIONS[recordType] || []));
}

export function canCreateLinkedAction(userPermissions: string[], recordType: string) {
  return actionCreatePermissions(recordType).some((permission) => userPermissions.includes(permission));
}
