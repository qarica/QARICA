# QARICA Production Release Audit — 23/09/2026

## Final baseline

- Production main audited at commit `3b00d07d304318db441417a2125c993a44d1f311` (PR #313).
- QARICA remains generic, multi-year and multi-organization.
- Annual plans, including any 2026 plan, are runtime data and are not application architecture.
- Runtime source contains no hard-coded `2026`, `KH50`, `TTSG` or organization-specific `Tâm Trí` markers under `src`.
- The canonical A–S Master Task Register remains the release baseline; the historical 130-task list is not the master register.

## Final release evidence

- PR #313 Quality Gate: PASS on the Node 24 workflow.
- GitHub Actions runtime uses `actions/checkout@v7` and `actions/setup-node@v7`; the previous forced Node 20 compatibility warning is removed.
- Vercel Production deployment for commit `3b00d07d304318db441417a2125c993a44d1f311`: READY.
- Vercel runtime error/fatal scan for the final deployment: clean.
- Vercel grouped runtime-error scan for the audited window: no runtime errors.
- Vercel toolbar unresolved feedback threads: 0.
- A–S executable regression guard inventory covers all 19 lanes.
- There are no open release PRs at the final baseline.

## Database verification

The last full Production SQL verification sweep before the final application-only delta passed all repository verification scripts existing at that audit point: 43/43 PASS.

The delta from the prior audited database baseline `10ab0ce0fe9f1e49d7dad9793d21c54b0646d932` (#307) through final application commit #313 contains no `supabase/migrations/` changes. The final release therefore re-ran the highest-risk Production contracts rather than replaying schema work:

- `DATA_INTEGRITY_5S_POSTCHECK_V1.sql`: 38/38 integrity checks PASS.
- `TENANT_READ_BOUNDARY_POSTCHECK_V1.sql`: authenticated-execute boundary contracts PASS.
- `TRANSACTION_HARDENING_POSTCHECK_V1.sql`: PASS for 25 hardened RPCs and 6 verified unique indexes.
- `ATOMIC_WORKFLOW_RPC_CONTRACT_POSTCHECK_V1.sql`: RPC existence, SECURITY DEFINER contract, authenticated blocking and service-role execution all PASS.
- `NOTIFICATION_RECIPIENT_EVENT_UNIQUENESS_POSTCHECK_V1.sql`: recipient/event uniqueness PASS.
- `INCIDENT_E2E_JOURNEY_POSTCHECK_V1.sql`: Incident journey and immutable published lesson contract PASS at the final-delta audit.

## Data integrity 5S

The release audit checks core orphan and duplicate risks across Records, Actions, Evidence, department executions, CAPA, Assessment, Audit/Finding, Directive/Action, FMEA, Inspection, Program, RCA, Risk, Quality Domains, Record links and Notifications.

Observed at the final audit:

- Core orphan checks: 0.
- Link-layer orphan checks: 0.
- Duplicate record/indicator/checklist codes within organization: 0.
- Duplicate notification recipient/event keys: 0.
- Duplicate core relationship links: 0.
- Traceability links awaiting confirmation: 0.

The repeatable SQL is stored in `supabase/verification/DATA_INTEGRITY_5S_POSTCHECK_V1.sql`.

## Product closure across A–S

The release closes the current reproduced gaps across the canonical lanes, including:

- generic traceability and tenant boundaries;
- annual Plan automation without hard-coding one year's plan;
- Action/My Work/Calendar/Gantt, including department Action atomic START/RESUME/SUBMIT/RETURN/VERIFY and USER/GROUP verification;
- criteria/self-assessment and external-assessment workflow hardening;
- checklist/monitoring/audit setup and finding/recheck flow;
- generic indicator runtime and period automation without the former 2026 blueprint;
- Incident/RCA/lessons flow and same-day reporting KPI;
- CAPA RCA, Corrective + Preventive Action, evidence, effectiveness review and close gates;
- Risk/FMEA/Improvement workflow;
- Feedback/Directive/Report workflow;
- notification recipient/event deduplication and phase escalation;
- speech-to-text support for long quality-workflow narrative fields already covered by the reusable dictation component;
- permissions/organization/RLS fail-closed checks;
- navigation, Smart Command Center orchestration, Calendar event-kind filters and Node 24 CI.

Closed historical tasks must not be reopened without reproducing a current failure against this baseline.

## Security advisor interpretation

Seven tables are intentionally RLS-enabled with no client policy and have client grants revoked; they are service-role/deny-by-design tables.

Three SECURITY DEFINER RPCs remain intentionally callable by authenticated users because they are scoped self-service authorization/notification functions:

- `has_permission`
- `can_create_record_type`
- `mark_own_notifications_read`

Their authenticated-execute contract is covered by the tenant boundary postcheck.

Supabase Auth leaked-password protection is still reported disabled by the Security Advisor. Current connected project tooling exposes database, advisor and documentation operations but does not expose an Auth configuration mutation for this setting. Supabase documents the setting under Authentication password security; enabling it is an external Supabase Auth configuration item rather than a repository/database migration.

## Performance advisor interpretation

The database advisor reports many unindexed foreign keys and some unused indexes. QARICA does not mass-create/drop indexes from advisor counts alone.

A final `pg_stat_statements` review showed the most frequent application-level authorization path is `has_permission`; its underlying joins already have covering unique indexes on:

- `user_roles(user_id, role_id)`
- `role_permissions(role_id, permission_id)`
- `user_permissions(user_id, permission_id)`
- `permissions(code)`

No speculative index changes were added at release close. Future index work requires query-path evidence.

## Migration lineage

Production migration history and repository historical migration filenames are not one-to-one because earlier schema work was applied under multiple historical migration names and later consolidated in repository lineage. Current schema contracts are validated by Production postchecks and transaction preflight. Do not replay old migrations solely to make history names match.

For a new environment, validate the repository migration chain on an isolated Supabase branch before promotion. Never replay historical Production-only migrations onto Production.

## Definition of done for this release

The current QARICA release queue is closed when all of the following are true:

1. Quality Gate passes on Node 24.
2. Production deployment is READY.
3. Runtime error/fatal and grouped runtime-error scans are clean.
4. Production database critical contracts and 5S checks pass.
5. A–S executable regression inventory covers all 19 lanes.
6. No unresolved deployment feedback thread remains.
7. No open release PR remains.
8. Annual-plan or organization-specific data is not embedded as runtime architecture.

At commit #313, items 1–8 are satisfied. The only remaining security configuration item identified by the Supabase Advisor is leaked-password protection in Supabase Auth, which is outside the repository/database migration surface available to this release tooling.
