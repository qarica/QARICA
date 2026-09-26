# QARICA EMR RC10 — Final pre-deployment audit

## Release decision
RC10 freezes EMR feature scope. No additional feature work should enter this release unless it fixes a blocker.

## Four-role gate
- Product / QLCL: PASS (static). Command Center supports workstream, department, owner, deadline, blocker, escalation, evidence, verification and Go-live gates.
- Solution architecture: PASS (static). `emr_rollout_items` remains the canonical program-control source. Dashboard is a read/aggregation layer and does not create a second source of truth.
- Data / security: PASS (static). EMR routes require `emr.view`/`emr.manage`; organization scope is resolved server-side; legacy prototype tables are quarantined by migration.
- QA / release: CONDITIONAL. Source/static checks pass; a clean dependency install followed by `npm run lint`, `npm test`, and `npm run build` remains mandatory in GitHub/Vercel before production promotion.

## Deployment stop conditions
Do not promote when any of these occurs: migration failure; missing EMR permissions; failed RLS/postcheck; lint/test/build failure; authenticated user can read another organization; read-only user can mutate EMR; a verified Go-live gate lacks DONE status or evidence.

## Deployment order
1. Back up / confirm Supabase migration state.
2. Apply pending migrations in repository order.
3. Run `supabase/verification/EMR_COMMAND_CENTER_POSTCHECK_V1.sql`.
4. Run CI: lint -> test -> build.
5. Deploy application once.
6. Smoke test `/dashboard`, `/emr`, one EMR category, read-only RBAC, manage RBAC, mobile layout.
7. Promote only when all gates pass.

## Rollback
If a gate fails, stop promotion. Roll back application deployment first. Do not destructively reverse historical migrations without database review; use a forward corrective migration.
