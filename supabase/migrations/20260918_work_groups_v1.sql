-- Reusable work groups for cross-module assignment.
create table if not exists public.work_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text,
  name text not null,
  group_type text not null default 'WORKING_GROUP',
  description text,
  lead_department_id uuid references public.departments(id),
  leader_user_id uuid references public.profiles(user_id),
  valid_from date,
  valid_to date,
  is_active boolean not null default true,
  created_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_groups_name_not_blank check (length(trim(name)) > 0),
  constraint work_groups_date_order check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create unique index if not exists uq_work_groups_org_code
on public.work_groups(organization_id, lower(code))
where code is not null and trim(code) <> '';

create table if not exists public.work_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.work_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id),
  member_role text not null default 'MEMBER',
  is_active boolean not null default true,
  joined_at date,
  left_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_group_members_role_check check (member_role in ('LEADER','DEPUTY','SECRETARY','MEMBER')),
  constraint work_group_members_date_order check (left_at is null or joined_at is null or left_at >= joined_at)
);

create unique index if not exists uq_work_group_member
on public.work_group_members(group_id,user_id);

alter table public.work_programs
  add column if not exists assigned_group_ids uuid[] not null default '{}'::uuid[];

alter table public.actions
  add column if not exists collaborating_group_ids uuid[] not null default '{}'::uuid[];

create table if not exists public.work_group_assignment_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  group_id uuid not null references public.work_groups(id),
  target_record_id uuid not null references public.records(id),
  assignment_role text not null,
  member_snapshot jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  constraint work_group_assignment_role_check check (assignment_role in ('PLAN_EXECUTION','ACTION_COLLABORATOR','AUDIT_TEAM','ASSESSMENT_TEAM','RCA_TEAM','IMPROVEMENT_TEAM','OTHER')),
  constraint work_group_assignment_snapshot_array check (jsonb_typeof(member_snapshot)='array')
);

create unique index if not exists uq_work_group_assignment_snapshot
on public.work_group_assignment_snapshots(group_id,target_record_id,assignment_role);

alter table public.work_groups enable row level security;
alter table public.work_group_members enable row level security;
alter table public.work_group_assignment_snapshots enable row level security;

drop policy if exists work_groups_select_same_org on public.work_groups;
create policy work_groups_select_same_org on public.work_groups
for select to authenticated
using (organization_id = public.current_user_organization_id());

drop policy if exists work_group_members_select_same_org on public.work_group_members;
create policy work_group_members_select_same_org on public.work_group_members
for select to authenticated
using (exists(
  select 1 from public.work_groups g
  where g.id=work_group_members.group_id
    and g.organization_id=public.current_user_organization_id()
));

drop policy if exists work_group_assignment_snapshots_select_same_org on public.work_group_assignment_snapshots;
create policy work_group_assignment_snapshots_select_same_org on public.work_group_assignment_snapshots
for select to authenticated
using (organization_id=public.current_user_organization_id());

comment on table public.work_groups is 'Reusable user groups/working teams for assignment across QARICA.';
comment on table public.work_group_assignment_snapshots is 'Historical snapshot of group members at assignment time; later membership changes must not rewrite old assignments.';
