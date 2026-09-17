alter table public.project_objectives
  add column if not exists indicator_name text,
  add column if not exists baseline_value text,
  add column if not exists target_value text,
  add column if not exists unit text,
  add column if not exists target_date date,
  add column if not exists updated_at timestamptz not null default now();

alter table public.project_milestones
  add column if not exists sequence_no integer,
  add column if not exists pdsa_phase text,
  add column if not exists description text,
  add column if not exists planned_start_date date,
  add column if not exists planned_end_date date,
  add column if not exists study_result text,
  add column if not exists learning_summary text,
  add column if not exists act_decision text,
  add column if not exists updated_at timestamptz not null default now();

update public.project_milestones set planned_end_date=due_date where planned_end_date is null and due_date is not null;
alter table public.project_milestones drop constraint if exists project_milestones_pdsa_phase_check;
alter table public.project_milestones add constraint project_milestones_pdsa_phase_check check (pdsa_phase is null or pdsa_phase in ('PLAN','DO','STUDY','ACT'));
alter table public.project_milestones drop constraint if exists project_milestones_act_decision_check;
alter table public.project_milestones add constraint project_milestones_act_decision_check check (act_decision is null or act_decision in ('ADOPT','ADAPT','ABANDON'));
create index if not exists idx_project_objectives_project_sequence on public.project_objectives(project_id,sequence_no);
create index if not exists idx_project_milestones_project_sequence on public.project_milestones(project_id,sequence_no);
alter table public.project_objectives enable row level security;
alter table public.project_milestones enable row level security;
revoke all on table public.project_objectives from anon,authenticated;
revoke all on table public.project_milestones from anon,authenticated;
grant select,insert,update,delete on table public.project_objectives to service_role;
grant select,insert,update,delete on table public.project_milestones to service_role;
