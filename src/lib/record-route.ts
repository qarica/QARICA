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

// /records/{id} was never implemented (no page.tsx) — a notification whose
// record_type can't be resolved to a real route (record deleted, type not in
// FALLBACK_ROUTES, no permission to read record_types) used to land here and
// hit a genuine 404. Fall back to /dashboard, which always exists.
export function routeForRecord(recordType: string, id: string, template?: string | null) {
  const raw = template || FALLBACK_ROUTES[recordType];
  if (!raw) return "/dashboard";
  return raw.replace("{id}", id);
}
