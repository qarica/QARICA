-- QARICA Incident contributing factors V1
-- Structured system-thinking taxonomy inspired by London Protocol categories.

create table if not exists public.incident_contributing_factors (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  factor_code text not null check (factor_code in (
    'PATIENT',
    'STAFF',
    'TASK_TECHNOLOGY',
    'TEAM',
    'WORK_ENVIRONMENT',
    'INFORMATION_SYSTEMS',
    'ORGANIZATION_MANAGEMENT',
    'INSTITUTIONAL_CONTEXT'
  )),
  note text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incident_contributing_factors_incident_code_key unique (incident_id, factor_code)
);

create index if not exists idx_incident_contributing_factors_incident
  on public.incident_contributing_factors(incident_id);
create index if not exists idx_incident_contributing_factors_code
  on public.incident_contributing_factors(factor_code);

alter table public.incident_contributing_factors enable row level security;

drop policy if exists qlcl_authenticated_select on public.incident_contributing_factors;
create policy qlcl_authenticated_select
on public.incident_contributing_factors
for select
to authenticated
using (true);
