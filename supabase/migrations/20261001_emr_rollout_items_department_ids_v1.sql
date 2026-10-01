-- EMR rollout items previously supported exactly one department per item
-- (department_id uuid, or NULL meaning "toàn viện" / whole hospital) — there
-- was no way to scope an item to several specific departments without also
-- including every other department. Replace the single-department column
-- with department_ids (uuid[]) as the one source of truth for department
-- scope: empty array keeps the existing "toàn viện" meaning, one or more
-- ids scopes the item to exactly those departments.

alter table public.emr_rollout_items add column if not exists department_ids uuid[] not null default '{}';

update public.emr_rollout_items
set department_ids = array[department_id]
where department_id is not null and department_ids = '{}';

create index if not exists emr_rollout_items_department_ids_idx
  on public.emr_rollout_items using gin (department_ids);

drop index if exists public.emr_rollout_items_org_department_idx;

alter table public.emr_rollout_items drop column if exists department_id;
