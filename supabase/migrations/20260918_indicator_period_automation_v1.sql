alter table public.indicator_assignments
  add column if not exists active_from date,
  add column if not exists active_to date,
  add column if not exists auto_create_periods boolean not null default false,
  add column if not exists source_reference text;

create unique index if not exists uq_indicator_measurements_assignment_period
  on public.indicator_measurements(indicator_assignment_id, period_start, period_end);

comment on column public.indicator_assignments.active_from is 'First date from which scheduled measurement periods may be materialized.';
comment on column public.indicator_assignments.active_to is 'Optional last date through which scheduled measurement periods may be materialized.';
comment on column public.indicator_assignments.auto_create_periods is 'When true, QARICA materializes measurement periods idempotently from the assignment cadence.';
comment on column public.indicator_assignments.source_reference is 'Approved source used to configure the operating cadence, e.g. annual quality plan.';
