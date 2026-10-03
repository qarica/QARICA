# QARICA — Final pre-deployment status

Date: 2026-09-26

## Release scope
- QARICA light enterprise visual system.
- EMR Command Center and program-control workflow.
- Organization-scoped EMR APIs and EMR RBAC (`emr.view`, `emr.manage`).
- Department/owner/deadline/priority/blocker/escalation controls.
- Evidence + verification requirement for Go-live gates.
- Legacy EMR prototype quarantine migration and post-deployment checks.

## Four-role gate
- Product / Quality Management: PASS (static review)
- Solution Architecture: PASS (static review)
- Data / Security: PASS (static review; production RLS requires post-migration verification)
- QA / Release: STATIC PASS; runtime CI remains the mandatory deployment gate

## Static checks completed
- ZIP/source integrity checked.
- No GitHub PAT pattern found in packaged source.
- No unresolved merge-conflict markers found in `src/` or `supabase/`.
- No TTSG/KH50 hard-coding found in runtime `src/`.
- EMR dashboard and item APIs use `emr_rollout_items` as the program-control source.

## Mandatory CI gate before production
Run, in order:
1. `npm ci`
2. `npm run lint`
3. `npm test`
4. `npm run build`
5. Apply database migrations in the documented order.
6. Run the EMR post-deployment SQL verification.
7. Smoke-test authentication, QLCL dashboard, EMR dashboard, one read-only EMR account and one EMR manager account.

Do not promote to production if any mandatory gate fails.

## Environment limitation during packaging
Dependency installation could not complete within the packaging environment's execution window. Therefore lint/test/build are deliberately not represented as passing in this artifact. This is a release-gate requirement, not a hidden PASS.
