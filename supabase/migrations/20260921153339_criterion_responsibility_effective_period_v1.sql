alter table public.criterion_responsibilities
 add column if not exists effective_from date,
 add column if not exists effective_to date;

alter table public.criterion_responsibilities
 drop constraint if exists criterion_responsibilities_effective_period_ck;
alter table public.criterion_responsibilities
 add constraint criterion_responsibilities_effective_period_ck
 check (effective_to is null or effective_from is null or effective_to >= effective_from);

drop index if exists public.uq_criterion_responsibilities_scope;
create unique index if not exists uq_criterion_responsibilities_scope_period
 on public.criterion_responsibilities(
   organization_id,criteria_version_id,criteria_item_id,
   coalesce(effective_from,make_date(work_year,1,1))
 );

comment on column public.criterion_responsibilities.effective_from is 'Start of responsibility validity. Null falls back to Jan 1 of work_year for legacy rows.';
comment on column public.criterion_responsibilities.effective_to is 'End of responsibility validity; null means open-ended within applicable business rules.';
