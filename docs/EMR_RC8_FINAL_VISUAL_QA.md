# QARICA EMR RC8 — Final visual/control QA

Date: 2026-09-26

## Scope
- Preserve the approved light enterprise QARICA shell and EMR Command Center.
- Keep `emr_rollout_items` as the canonical tenant-scoped EMR program-control source.
- Avoid fabricated clinical/HSBA KPIs when no authoritative source exists.

## RC8 hardening
1. EMR navigation is permission-aware (`emr.view`) so unauthorized users do not see dead-end links.
2. Deadline/overdue classification uses the Vietnam local calendar day (`Asia/Ho_Chi_Minh`) rather than UTC-midnight parsing.
3. Command Center now exposes control-data coverage for owner, department, deadline and verified completed Go-live gates.
4. Read-only empty states no longer instruct users to create records they cannot create.
5. Responsive rules keep KPI, coverage and control panels usable at tablet/mobile widths.

## Release principles
- Work completion is not the same as Go-live readiness.
- A Go-live gate passes only when DONE + evidence + verification are all present.
- Dashboard aggregates; source modules remain the place where operational records are maintained.
- No hospital-specific master data is hard-coded into the EMR runtime UI/API.

## Validation status
- Static source/integrity audit: PASS.
- Secret scan for common GitHub PAT/private-key patterns: PASS.
- Full npm lint/test/build: NOT VERIFIED in this packaging environment because dependencies are not installed. The repository CI/Vercel build must remain the final executable gate before production.
