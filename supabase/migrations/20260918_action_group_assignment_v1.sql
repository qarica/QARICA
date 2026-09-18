-- Assignment target model: every Action can be assigned primarily to either one user or one reusable group.
alter table public.actions
  add column if not exists assignment_target_type text not null default 'USER',
  add column if not exists assignee_group_id uuid references public.work_groups(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.actions'::regclass
      and conname='actions_assignment_target_type_check'
  ) then
    alter table public.actions
      add constraint actions_assignment_target_type_check
      check (assignment_target_type in ('USER','GROUP'));
  end if;
end $$;

create index if not exists idx_actions_assignee_group_id
  on public.actions(assignee_group_id)
  where assignee_group_id is not null;

alter table public.recurring_work_templates
  add column if not exists assignment_target_type text not null default 'USER',
  add column if not exists assignee_group_id uuid references public.work_groups(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.recurring_work_templates'::regclass
      and conname='recurring_work_templates_assignment_target_type_check'
  ) then
    alter table public.recurring_work_templates
      add constraint recurring_work_templates_assignment_target_type_check
      check (assignment_target_type in ('USER','GROUP'));
  end if;
end $$;

create index if not exists idx_recurring_work_templates_assignee_group_id
  on public.recurring_work_templates(assignee_group_id)
  where assignee_group_id is not null;

alter table public.work_group_assignment_snapshots
  drop constraint if exists work_group_assignment_role_check;

alter table public.work_group_assignment_snapshots
  add constraint work_group_assignment_role_check
  check (assignment_role in (
    'PLAN_EXECUTION',
    'ACTION_ASSIGNEE_GROUP',
    'ACTION_COLLABORATOR',
    'AUDIT_TEAM',
    'ASSESSMENT_TEAM',
    'RCA_TEAM',
    'IMPROVEMENT_TEAM',
    'OTHER'
  ));

create or replace view public.vw_actions_dashboard as
select
  a.id as action_id,
  a.id,
  a.record_id,
  r.record_code,
  r.title as record_title,
  a.title,
  a.description,
  a.priority,
  a.lead_department_id,
  a.assignee_user_id,
  a.start_date,
  a.due_date,
  a.workflow_status,
  a.created_at,
  a.updated_at,
  case when a.due_date is null then null::integer else a.due_date-current_date end as days_to_due,
  case
    when a.due_date is not null
      and a.due_date<current_date
      and a.workflow_status<>all(array['COMPLETED'::text,'CANCELLED'::text,'NOT_APPLICABLE'::text])
    then true else false
  end as is_overdue,
  r.work_year,
  a.assignment_target_type,
  a.assignee_group_id
from public.actions a
left join public.records r on r.id=a.record_id;

comment on column public.actions.assignment_target_type is 'Primary Action assignment target: USER or GROUP.';
comment on column public.actions.assignee_group_id is 'Reusable work group responsible for the Action when assignment_target_type=GROUP.';
