# QARICA EMR RC7 — Release Readiness

## Decision
RC7 removes the principal data-security blocker found during release audit: the parallel prototype schema created by `20260925_emr_dashboard.sql` is now quarantined from `anon` and `authenticated` clients. `emr_rollout_items` remains the canonical EMR program-control source of truth.

## Four-role audit

### Product / Quality Management
- Command Center remains a control surface, not a second data-entry source.
- Department matrix, escalation queue, overdue/stale/unassigned/critical signals and Go-live gates are derived from source records.
- Task completion is explicitly distinct from Go-live readiness.
- Go-live gate PASS requires DONE + evidence + verification.

### Solution Architecture
- One shared EMR rollout engine serves the current workstreams.
- Dashboard/API are organization-scoped and drill down to source modules.
- The old parallel EMR prototype schema is not used by application code and is quarantined rather than promoted as a second source of truth.

### Data / Security
- `emr.view` is required for reads; `emr.manage` is required for mutations.
- API derives organization from the authenticated profile, not request input.
- Department and owner assignments are validated against the caller organization.
- Legacy non-tenant prototype tables have their permissive policies removed and privileges revoked from `anon` and `authenticated`.

### QA / Release
- Static EMR security regression tests exist for permission checks, organization filtering and verification behavior.
- Repository includes GitHub Quality Gate: lint -> test -> build.
- Full local dependency install/build could not be independently completed in the packaging environment; therefore runtime build remains a release WARNING until CI/GitHub or Vercel reports PASS.

## Release status
- BLOCKER: none identified in the audited EMR path after legacy quarantine.
- WARNING: full `npm run lint`, `npm run test`, and `npm run build` still require an environment with dependencies installed.
- DEPLOY RULE: do not promote if migration, lint, test, or build fails.

## Migration order relevant to EMR
1. `20260921_emr_rollout_items_v1.sql`
2. `20260925_emr_dashboard.sql` (legacy prototype; immediately quarantined later)
3. `20260926_emr_program_control_v1.sql`
4. `20260926_emr_permissions_v1.sql`
5. `20260926_emr_legacy_quarantine_v1.sql`

The legacy migration is retained to avoid rewriting migration history. The quarantine migration is intentionally additive and safe for databases where the legacy migration may already have run.
