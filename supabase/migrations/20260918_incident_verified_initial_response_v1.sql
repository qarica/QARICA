alter table public.incidents
  add column if not exists verified_initial_response text,
  add column if not exists verified_initial_response_by uuid,
  add column if not exists verified_initial_response_at timestamptz;

comment on column public.incidents.verified_initial_response is
  'QLCL-verified immediate safety response recorded during triage when the original reporter did not provide an initial response.';
comment on column public.incidents.verified_initial_response_by is
  'User who recorded the verified immediate safety response.';
comment on column public.incidents.verified_initial_response_at is
  'Timestamp when the verified immediate safety response was recorded.';
