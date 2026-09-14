const FALLBACK_ROUTES: Record<string, string> = {
  ACTION: "/tasks/{id}",
  PROGRAM: "/plans/{id}",
  DIRECTIVE: "/directives/{id}",
  REPORT: "/reports/{id}",
  MONITORING: "/monitoring/{id}",
  INDICATOR_MEASUREMENT: "/indicators/measurements/{id}",
  FINDING: "/findings/{id}",
  CAPA: "/capa/{id}",
  INCIDENT: "/incidents/{id}",
  SAFETY_ALERT: "/safety-alerts/{id}",
  RISK: "/risks/{id}",
  FMEA: "/fmea/{id}",
  ASSESSMENT: "/assessments/{id}",
  EXTERNAL_ASSESSMENT: "/external-assessments/{id}",
  IMPROVEMENT_PROPOSAL: "/improvement/proposals/{id}",
  IMPROVEMENT_PROJECT: "/improvement/projects/{id}",
  AUDIT: "/audits/{id}",
  INSPECTION: "/inspections/{id}",
  FEEDBACK: "/feedback/{id}",
};

export function routeForRecord(recordType: string, id: string, template?: string | null) {
  const raw = template || FALLBACK_ROUTES[recordType] || "/records/{id}";
  return raw.replace("{id}", id);
}
