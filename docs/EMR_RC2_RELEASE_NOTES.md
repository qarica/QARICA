# EMR Command Center RC2

## Control baseline
- Dashboard is aggregation only; source modules remain the system of record.
- Tenant boundary derives from authenticated profile organization_id, never client input.
- Work progress is DONE/total and is explicitly not Go-live readiness.
- Go-live gates pass only when DONE + evidence + explicit verification.
- Project control metadata: department, owner, due date, priority, gate, evidence, verification.
- Control signals: blocker, overdue, stale >7 days, unassigned open work, open CRITICAL work.
- Department and owner choices are loaded from the current organization only.

## Migration required
Apply `supabase/migrations/20260926_emr_program_control_v1.sql` before using RC2.
Do not treat `20260925_emr_dashboard.sql` specialist tables as the multi-tenant source of truth until separately hardened.

## Release discipline
RC2 is intended to be bundled with the QARICA light UI release to minimize Vercel deployments.
