# QARICA — Audit & Conversation History Ledger

**Updated:** 2026-09-24 (Asia/Ho_Chi_Minh)  
**Baseline:** Master Task Register A–S / 360+  
**Repository:** qarica/QARICA  
**Source audit:** `QARICA-Bao-cao-ra-soat-va-de-xuat.pdf`, static review at commit `10ab0ce` (23/09/2026)

## 1. Product principles that must not be lost

- QARICA is a **generic, multi-year, multi-organization** quality-management platform.
- Annual plans are **data instances, not architecture**.
- **KH50 / Kế hoạch QLCL 2026 is only a 2026 reference/test dataset.** It must never become the core schema, code baseline, or template for later years.
- Core operating principle: **enter once — reuse everywhere**.
- Core traceability: **Source → Requirement/Finding → Action/CAPA → Execution → Evidence → Verification → Effectiveness → Closure → Report/Analytics**.
- Four roles must be applied together: healthcare quality expert, system architect/developer, daily user/tester, quality-control/chief assistant.
- 5S is mandatory before closing a group: stale data, duplicate records, legacy paths, orphan links, obsolete labels/menu, test data, schema drift, permission/RLS, dead code.
- Build/Gate PASS alone is not DONE. DONE requires Preview/functional/data/UI/regression, merge main, Production READY and sanity.
- Parallel branches are allowed; Production merge is sequential through the Release Gate.

## 2. Source audit interpretation rule

The uploaded audit is a **static review** of commit `10ab0ce`. Every finding must be re-checked against current `main` before opening new work. Do not reopen a historical finding merely because it existed in the PDF.

Priority order:
1. High severity findings and the “10 việc nên làm trước tiên”.
2. Medium findings with data/race/security/workflow impact.
3. Low findings and consistency/UX cleanup.
4. Brainstorm section J only when it does not require a business-policy decision.

## 3. Top-10 findings from the audit — current verified status

| Audit priority | Finding | Current status | Evidence / merged change |
| --- | --- | --- | --- |
| 1 | Cross-organization department PATCH / IDOR | DONE on main | #315 `db6224c` — scope department admin updates to caller organization + regression guard |
| 2 | Stored XSS through evidence upload (.html/.svg, spoofed mime) | DONE on main | #316 `ce2f2f1` — strict evidence file policy, safe-inline/forced-download behavior, tests |
| 3 | Assessment progress denominator fails with N/A | DONE on main | #327 `b590e48` — client/server applicability scope aligned |
| 4 | Duplicate assessment scorer / dead 405 panel | DONE on main | #327 `b590e48` — duplicate scorer removed; runtime guard test |
| 5 | Recurring sync for GROUP uses stale materializer | DONE on main | #333 `7b6d161` — unified group-aware formal materializer v5 |
| 6 | Plan save silently drops tasks with blank titles | DONE on main | #323 `764cfb3` — explicit untitled-task validation + test |
| 7 | Serious incident flag not visible in main workflow | DONE on main | #324 `a9b2801` — persistent serious-incident visibility + test |
| 8 | Record lifecycle cancellation not synchronized across domain workflow | DONE on main | #320 `e5b2641` — canonical lifecycle transaction, organization/domain sync, legacy fallback removed |
| 9 | Criteria management lacks audit trail / publish non-atomic | DONE on main | #325 atomic audited publish; #348/#349 management audit; #358 atomic audited creation/revision |
| 10 | Finding/CAPA terminal RPCs lack organization / active-user guard | DONE on main | #330 `8b5b94c` — terminal organization guards + postcheck/test |

## 4. Other audit findings already addressed on main

- Department Action lifecycle hardened to atomic START/RESUME → SUBMIT → RETURN → VERIFY, with audit and service-role-only RPCs.
- USER/GROUP Action verification moved to atomic RPC.
- Legacy linked-Action and Plan-Action multi-write fallbacks removed.
- Work-group membership updates atomicized (#371).
- Incident → CAPA creation atomicized and duplicate-safe.
- Criteria item activation/cascade atomicized (#366).
- Assessment criterion upsert/transition/finalization guarded atomically.
- CAPA effectiveness gate/review and core terminal transitions atomicized.
- Evidence upload supports multiple files; partial upload retry no longer duplicates completed uploads.
- 5S evidence upload policy and batching hardened (#374).
- FMEA scoring/setup transitioned to canonical atomic schema/RPCs (#380/#381/#383).
- Generic domain-record creation moved to atomic transaction (#379).
- Generic organization wording removed residual hospital-specific copy (#377).
- Self-assessment operability improved (#388).
- Dashboard domain queries scoped at DB/query level (#389).
- Monitoring checklist counts scoped to latest versions (#392).
- Hard-coded 2026 indicator runtime blueprint removed earlier; annual plans remain data, not architecture.
- Generic Plan/Action Gantt and runtime-driven Calendar Blueprint implemented.
- Speech-to-text available as a reusable narrative-entry aid; it never auto-submits or changes workflow state.

## 5. Active work at this ledger point

**Main:** `409aea771098cccf5bfb0d322929912f988c74bf` (#392 merged after #389).

- RCA optimistic concurrency branch: prevents stale investigator saves from overwriting newer RCA. Quality Gate/Preview passed before rebase; must rebase to latest main and apply migration/postcheck before merge.
- Indicator period sync batching: addresses audit finding G about assignment×period serial DB round-trips. Initial build failed because closure lost TypeScript null narrowing; branch has been rebased to #392 and the organization id is now copied into a non-null constant after the guard. Gate must be rerun.
- Audit/history ledger: this file preserves decisions, progress and handoff state for later chats.

## 6. Findings from the PDF that remain priorities after the top 10

### C — Plan / Action / Execution
- Validate remaining recurring-sync duplication/dead code after v5 consolidation.
- Keep evidence partial-upload retry regression covered.
- Continue removing stale/manual multi-write workflow paths if any remain.
- Verify all Plan validation uses batch queries where practical.

### D / K — CAPA / Finding / Evidence / Improvement
- Continue checking all sibling RPCs when one org/security bug is found.
- Prefer atomic transitions; no route-side rollback chains.
- Translate raw database exceptions into user-facing Vietnamese business messages.
- Continue Improvement optimistic-concurrency and duplicate-prevention audit.

### E — Incident / Risk / Safety / FMEA
- RCA optimistic concurrency is active work.
- Continue integration-level checks beyond source-grep guards.
- Safety Alert permission separation remains a design/permission audit item unless already addressed on newer main.

### F — Assessment / Audit / Criteria
- Criteria management audit/atomic issues are fixed.
- Continue UX consistency: autosave/leave-page protection, department responsibility visibility, score bounds, filters/grouping.
- Do not modify published criteria versions in place; create revision.

### G — Indicator / Dashboard / Monitoring
- Indicator period sync batching is active work.
- Continue query-scope/performance work; avoid loading whole tables then filtering in client.
- Monitoring latest-version count scoping merged in #392.
- Keep Vietnam/HCM date helpers for monthly trend grouping.

### H / M / N / O — Feedback / Directive / Notifications / Admin / Lifecycle / UX
- Lifecycle canonical transaction fixed.
- Continue notification dedupe/phase/deep-link audit.
- Keep generic organization isolation in both application queries and RLS.
- Continue accessibility and responsive UI cleanup.

## 7. Release discipline

For every batch:
`Code → lint/type/build/test → Quality Gate → Preview → functional/data/UI regression → merge main → Production READY → runtime/DB sanity → update this ledger`.

Schema changes:
`audit live DB → migration → repository/main sync → apply Production → postcheck → continue`.

Never:
- bypass Gate,
- use production business records for destructive testing,
- create fake Actions/data just to make dashboards green,
- hard-code KH50/2026 as architecture,
- mark DONE based only on PR merge.

## 8. Chat handoff command

In a new chat, continue with:

**“Tiếp tục QARICA theo docs/QARICA_AUDIT_HISTORY_20260924.md và Master Task Register A–S/360+; kiểm tra main/Production trước khi làm, không hỏi lại các quyết định đã chốt.”**
