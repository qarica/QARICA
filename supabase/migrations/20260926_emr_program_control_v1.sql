-- QARICA EMR program-control metadata. Extends the tenant-safe shared rollout engine.
alter table public.emr_rollout_items
  add column if not exists department_id uuid references public.departments(id),
  add column if not exists owner_user_id uuid references auth.users(id),
  add column if not exists due_date date,
  add column if not exists priority text not null default 'MEDIUM',
  add column if not exists is_go_live_gate boolean not null default false,
  add column if not exists evidence_url text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users(id);

do $$ begin
  alter table public.emr_rollout_items add constraint emr_rollout_items_priority_check check (priority in ('LOW','MEDIUM','HIGH','CRITICAL'));
exception when duplicate_object then null; end $$;

create index if not exists emr_rollout_items_org_due_idx on public.emr_rollout_items(organization_id, due_date);
create index if not exists emr_rollout_items_org_department_idx on public.emr_rollout_items(organization_id, department_id);
create index if not exists emr_rollout_items_org_owner_idx on public.emr_rollout_items(organization_id, owner_user_id);
