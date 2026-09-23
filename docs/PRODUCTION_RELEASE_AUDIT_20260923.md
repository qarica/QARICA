# QARICA Production Release Audit — 23/09/2026

## Baseline

- Production main audited at commit `10ab0ce0fe9f1e49d7dad9793d21c54b0646d932` (PR #307).
- QARICA remains generic, multi-year and multi-organization.
- Annual plans such as the 2026 plan are runtime data, not application architecture.

## Release evidence

- PR #307 head Quality Gate: PASS.
- Vercel Production: READY.
- Vercel runtime error/fatal scan: clean.
- Supabase runtime error/fatal scan for the audited window: clean.
- All repository SQL verification scripts existing at the audit point: 43/43 PASS on Production.
- A–S executable regression guard inventory covers all 19 lanes.

## Data integrity 5S

The release audit checked core orphan and duplicate risks across Records, Actions, Evidence, department executions, CAPA, Assessment, Audit/Finding, Directive/Action, FMEA, Inspection, Program, RCA, Risk, Quality Domains, Record links and Notifications.

Observed at audit time:

- Core orphan checks: 0.
- Link-layer orphan checks: 0.
- Duplicate record/indicator/checklist codes within organization: 0.
- Duplicate notification recipient/event keys: 0.
- Duplicate core relationship links: 0.
- Traceability links awaiting confirmation: 0.

The repeatable SQL is stored in `supabase/verification/DATA_INTEGRITY_5S_POSTCHECK_V1.sql`.

## Security advisor interpretation

Seven tables are intentionally RLS-enabled with no client policy and have client grants revoked; they are service-role/deny-by-design tables. Three SECURITY DEFINER RPCs remain intentionally callable by authenticated users because they are scoped self-service authorization/notification functions:

- `has_permission`
- `can_create_record_type`
- `mark_own_notifications_read`

Supabase Auth leaked-password protection is currently reported disabled by the advisor. The available project tooling in this environment does not expose an Auth configuration mutation for that setting, so it remains an external Supabase Auth configuration item rather than a database migration.

## Performance advisor interpretation

The database advisor still reports many unindexed foreign keys and some unused indexes. QARICA does not mass-create/drop indexes from advisor counts alone. Hot-path indexes already have dedicated migrations and postchecks; further index changes require query-path evidence to avoid unnecessary write/storage cost.

## Migration lineage

Production migration history and repository historical migration filenames are not one-to-one because earlier schema work was applied under multiple historical migration names and later consolidated in repository lineage. Current schema contracts are validated by Production postchecks and transaction preflight. Do not replay old migrations solely to make history names match.

For a new environment, validate the repository migration chain on an isolated Supabase branch before promotion. Never replay historical Production-only migrations onto Production.

## Definition of done for this baseline

This audit closes the current release queue only when:

1. Quality Gate passes.
2. Production deployment is READY.
3. Runtime error scans are clean.
4. All Production SQL verification scripts pass.
5. DATA_INTEGRITY_5S_POSTCHECK_V1 passes.
6. No open release PR remains.

Future work starts from the latest main commit and the A–S Master Task Register; it must not reopen closed historical tasks without reproducing a current failure.
