-- QLCL-TTSG Plan Action Schedule V1
-- One Action can carry multiple mandatory reporting/implementation occurrences.

begin;

alter table if exists public.actions
  add column if not exists reporting_mode text not null default 'ONE_TIME',
  add column if not exists reporting_schedule jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'actions_reporting_mode_check'
  ) then
    alter table public.actions
      add constraint actions_reporting_mode_check
      check (reporting_mode in ('ONE_TIME','MILESTONES','MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL'));
  end if;
end $$;

create table if not exists public.action_occurrences (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.actions(id) on delete cascade,
  sequence_no integer not null,
  occurrence_label text not null,
  due_date date not null,
  workflow_status text not null default 'NOT_DUE',
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references public.profiles(user_id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(action_id, sequence_no),
  unique(action_id, due_date)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'action_occurrences_status_check'
  ) then
    alter table public.action_occurrences
      add constraint action_occurrences_status_check
      check (workflow_status in ('NOT_DUE','PENDING','SUBMITTED','VERIFIED','OVERDUE','WAIVED'));
  end if;
end $$;

create index if not exists idx_action_occurrences_action_due
  on public.action_occurrences(action_id, due_date);

alter table public.action_occurrences enable row level security;

-- Existing action visibility remains the source of truth: occurrence visibility follows its parent Action.
drop policy if exists action_occurrences_select_via_action on public.action_occurrences;
create policy action_occurrences_select_via_action
on public.action_occurrences for select
to authenticated
using (
  exists (
    select 1
    from public.actions a
    join public.records r on r.id = a.record_id
    where a.id = action_occurrences.action_id
  )
);

comment on table public.action_occurrences is
'Execution/reporting occurrences under one Action. Used when one plan task must report multiple times without duplicating the Action.';

comment on column public.actions.reporting_schedule is
'JSON schedule definition. Example MONTHLY: {"day":15,"end_date":"2026-12-15"}; MILESTONES: {"dates":["2026-09-15","2026-10-15"]}.';

commit;
