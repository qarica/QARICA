# EMR RC9 — Final release gate

RC9 does not change the canonical EMR business model introduced in RC8. It adds a deploy-time verification gate so production rollout can be checked without relying on UI appearance alone.

## Four-role release decision

### Product / Quality Control
- Dashboard is a command center over source-module records, not a second data-entry system.
- Work completion is explicitly separate from Go-live readiness.
- Go-live PASS requires DONE + evidence + verification.
- Department matrix, escalation, overdue, stale, owner/deadline coverage and critical work are visible.

### Solution Architecture
- `public.emr_rollout_items` remains the canonical tenant-scoped source of truth.
- Legacy prototype `emr_*` tables remain quarantined and are not dashboard dependencies.
- No TTSG/KH50/one-year runtime baseline is introduced.

### Data / Security
- Read uses `emr.view`; mutations use `emr.manage`.
- API derives organization from the authenticated profile and validates department/owner in that organization.
- Legacy prototype tables have client grants revoked by migration `20260926_emr_legacy_quarantine_v1.sql`.
- Run `supabase/verification/EMR_COMMAND_CENTER_POSTCHECK_V1.sql` after migrations.

### QA / Release
Before production, all of the following must pass in GitHub/Vercel or a machine with dependencies installed:

```bash
npm ci
npm run lint
npm test
npm run build
```

Then run the EMR SQL postcheck. Any build/test failure or non-zero integrity violation is a release blocker.

## Deployment economy
To reduce Vercel consumption, deploy this package as one release candidate rather than pushing intermediate RCs. Database migrations must be applied in repository order before accepting EMR traffic.
