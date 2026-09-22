alter table public.assessment_round_criteria
  add column if not exists applicability_status text not null default 'APPLICABLE',
  add column if not exists not_applicable_reason text,
  add column if not exists lead_department_id uuid references public.departments(id),
  add column if not exists support_department_ids uuid[] not null default '{}'::uuid[],
  add column if not exists responsibility_source_id uuid references public.criterion_responsibilities(id),
  add column if not exists responsibility_snapshot_at timestamptz;

alter table public.assessment_round_criteria
  drop constraint if exists assessment_round_criteria_applicability_ck;
alter table public.assessment_round_criteria
  add constraint assessment_round_criteria_applicability_ck
  check (applicability_status in ('APPLICABLE','NOT_APPLICABLE'));

alter table public.assessment_round_criteria
  drop constraint if exists assessment_round_criteria_na_reason_ck;
alter table public.assessment_round_criteria
  add constraint assessment_round_criteria_na_reason_ck
  check (applicability_status <> 'NOT_APPLICABLE' or nullif(btrim(not_applicable_reason),'') is not null);

create unique index if not exists uq_assessment_round_criteria_current
  on public.assessment_round_criteria(assessment_round_id,criteria_item_id)
  where criteria_item_id is not null;
create unique index if not exists uq_assessment_round_criteria_legacy
  on public.assessment_round_criteria(assessment_round_id,criterion_id)
  where criteria_item_id is null and criterion_id is not null;

comment on column public.assessment_round_criteria.applicability_status is 'Applicability frozen for this assessment round; generic across criteria sets.';
comment on column public.assessment_round_criteria.not_applicable_reason is 'Required explanation when this item is not applicable in this round.';
comment on column public.assessment_round_criteria.lead_department_id is 'Lead department snapshot for this assessment round.';
comment on column public.assessment_round_criteria.support_department_ids is 'Supporting department snapshot for this assessment round.';
comment on column public.assessment_round_criteria.responsibility_source_id is 'Optional source responsibility mapping used to create the frozen round snapshot.';
