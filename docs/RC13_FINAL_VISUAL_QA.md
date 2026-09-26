# RC13 — Final Visual & Responsive QA

Date: 2026-09-26

## Scope locked
No new EMR business features in RC13. This pass is limited to visual consistency, responsive behavior and release-risk reduction.

## Visual baseline
- Light enterprise healthcare shell across QARICA.
- White sidebar/topbar, pale blue-gray canvas, navy hierarchy, medical-blue primary action.
- Consistent card borders, radii and soft shadows.
- Semantic colors reserved for status/attention.
- EMR Command Center remains data-driven; illustrative KPI values are not hard-coded.

## RC13 adjustments
- EMR KPI row changes from 6 columns to 3 columns on medium desktop widths before collapsing to 2/1 columns.
- Wide EMR matrices remain horizontally scrollable and keep the department column sticky for operational readability.
- Mobile EMR spacing, heading size and live-data badge behavior tightened.
- No changes to EMR RBAC, tenant isolation, evidence/verification or Go-live gate semantics.

## Four-role gate
- Product / QLCL: PASS (static review)
- Solution architecture: PASS (static review)
- Data & security: PASS (static review; production RLS verification still required after migration)
- QA / Release: CONDITIONAL — source/ZIP static checks pass; dependency-backed lint/test/build must pass in CI before production.

## Deployment rule
Do not call the release production-ready unless migrations/post-checks, lint, tests, build and smoke tests pass in the target environment.
