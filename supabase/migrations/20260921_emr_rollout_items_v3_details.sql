-- EMR rollout module: each of the 8 categories tracks a genuinely different kind of
-- information in a real rollout (digital-signature items care about certificate expiry and
-- CA provider; medical-equipment items care about connection status; etc.) - one identical
-- form for all 8 didn't reflect that. owner_user_id/department_id/priority/is_go_live_gate/
-- evidence_url already give every category a real responsible person, scope and gate - this
-- adds only the remaining category-specific fields via a flexible `details` column, defined
-- per category in src/lib/emr-categories.ts.

alter table public.emr_rollout_items
  add column if not exists details jsonb not null default '{}'::jsonb;
