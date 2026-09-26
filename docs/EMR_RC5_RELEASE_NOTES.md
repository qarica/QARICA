# QARICA EMR RC5 — security & release hardening

## Four-role checkpoint
- Product/QLCL: Command Center remains a control layer over source modules; progress is not presented as Go-live readiness.
- Architecture: shared `emr_rollout_items` remains the canonical rollout source; no parallel dashboard-owned business data introduced.
- Data/Security: added `emr.view` / `emr.manage`; API mutation boundaries require manage permission; tenant checks remain server-side.
- QA/Release: added static regression tests for permission, tenant and verification gates.

## Verification invariant
A work item may be verified only when its effective state is `DONE` and effective evidence is present. Removing evidence or reopening an item clears verification.

## Deployment note
Apply migrations in order, including `20260926_emr_program_control_v1.sql` and `20260926_emr_permissions_v1.sql`, before exposing RC5. Full dependency-backed build/lint/test must pass in CI/Vercel before production promotion.
