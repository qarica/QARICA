alter table public.criterion_assessments
  add column if not exists assessed_by uuid references public.profiles(user_id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists uq_criterion_assessments_round_item
  on public.criterion_assessments(assessment_round_id,criteria_item_id)
  where criteria_item_id is not null;

comment on column public.criterion_assessments.assessed_by is
  'Last user who saved/submitted the self-assessment for this criterion.';
comment on column public.criterion_assessments.submitted_at is
  'Timestamp when the criterion was submitted for review.';
