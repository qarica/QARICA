# QARICA EMR RC3 — Command Center & Project Control

## Scope
- Fix dashboard control aggregation so owner/department are actually selected from `emr_rollout_items`.
- Add department-level control matrix derived from tenant-scoped source items.
- Add upcoming-deadline queue and broaden attention logic to include blockers, critical items, overdue items and TODO backlog.
- Preserve separation between task completion and Go-live readiness.
- Preserve evidence + verification requirement for a Go-live gate to pass.

## Governance rules
- Dashboard is read/aggregation only; operational changes remain in source EMR modules.
- No demo clinical volumes or fabricated EMR compliance KPIs are presented as production data.
- All dashboard data is scoped by the authenticated user's `organization_id`.
- Department and owner assignments are validated against the same organization on create/update.
- `DONE` is not equivalent to verified; a Go-live gate passes only when DONE + evidence + verification are present.
- Legacy `20260925_emr_dashboard.sql` is not the canonical multi-tenant model and should not be used as a new source of truth without tenant hardening.

## Release validation status
- Source-level audit completed for the changed EMR API/component paths.
- A real defect in RC2 was fixed: `department_id` and `owner_user_id` were referenced by dashboard aggregation but omitted from its Supabase select.
- Full dependency install/build/lint/test could not be completed in the execution environment because `npm ci` timed out. Do not claim CI PASS until GitHub/Vercel runs it.

## Recommended deployment
Keep this RC as a checkpoint. Merge/deploy only after CI succeeds and required Supabase migration `20260926_emr_program_control_v1.sql` is applied in the target environment.
