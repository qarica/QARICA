-- EMR Timeline: user-declared "đầu việc lớn" (top-level milestone, parent_id
-- is null) and "đầu việc con" (child work item, parent_id references the
-- parent). This is a separate, user-managed structure alongside the existing
-- auto-rollup-by-EMR_CATEGORIES view on /emr/timeline — that rollup stays
-- read-only/derived from emr_rollout_items, while this table is the thing a
-- user actually declares/edits directly (a real project plan's own line
-- items, not one row per EMR category). Generic per-organization data, not a
-- hard-coded business structure (CLAUDE.md principle 1).

create table if not exists public.emr_timeline_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  parent_id uuid references public.emr_timeline_milestones(id) on delete cascade,
  title text not null,
  start_date date,
  end_date date,
  status text not null default 'TODO' check (status in ('TODO','IN_PROGRESS','DONE','BLOCKED')),
  sort_order int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists emr_timeline_milestones_org_idx on public.emr_timeline_milestones(organization_id);
create index if not exists emr_timeline_milestones_parent_idx on public.emr_timeline_milestones(parent_id);

alter table public.emr_timeline_milestones enable row level security;

-- Same pattern as emr_rollout_items/emr_binding_groups: RLS only gates reads
-- to the caller's own organization; writes go through the API routes using
-- the service-role admin client with an application-level emr.manage check.
drop policy if exists qlcl_authenticated_select on public.emr_timeline_milestones;
create policy qlcl_authenticated_select
on public.emr_timeline_milestones
for select
to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));
