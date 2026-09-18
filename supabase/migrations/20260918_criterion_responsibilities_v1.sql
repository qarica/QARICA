create table if not exists public.criterion_responsibilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_year integer not null,
  criteria_version_id uuid not null references public.criteria_set_versions(id) on delete cascade,
  criteria_item_id uuid not null references public.criteria_items(id) on delete cascade,
  source_lead_label text,
  source_support_label text,
  lead_department_id uuid references public.departments(id) on delete restrict,
  support_department_ids uuid[] not null default '{}'::uuid[],
  source_contact_name text,
  source_target_text text,
  target_level numeric,
  source_due_text text,
  due_date date,
  expected_evidence text,
  source_note text,
  is_priority boolean not null default false,
  mapping_status text not null default 'UNCONFIRMED',
  source_reference text,
  confirmed_by uuid references public.profiles(user_id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint criterion_responsibilities_mapping_status_ck check (mapping_status in ('UNCONFIRMED','CONFIRMED','NEEDS_REVIEW'))
);

create unique index if not exists uq_criterion_responsibilities_scope
  on public.criterion_responsibilities(organization_id,work_year,criteria_version_id,criteria_item_id);

create index if not exists ix_criterion_responsibilities_lead
  on public.criterion_responsibilities(organization_id,work_year,lead_department_id);

alter table public.criterion_responsibilities enable row level security;

revoke all on table public.criterion_responsibilities from public, anon, authenticated;
grant select, insert, update, delete on table public.criterion_responsibilities to service_role;

comment on table public.criterion_responsibilities is
  'Annual source-grounded ownership map for criteria. Source labels are preserved; ambiguous department mappings require human confirmation.';
