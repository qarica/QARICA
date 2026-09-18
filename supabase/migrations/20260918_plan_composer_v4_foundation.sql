-- Plan Composer V4 foundation: multi-owner plans, task collaboration/hierarchy, and reusable legal/reference documents.

alter table public.work_programs
  add column if not exists lead_department_ids uuid[] not null default '{}'::uuid[],
  add column if not exists owner_user_ids uuid[] not null default '{}'::uuid[];

update public.work_programs
set lead_department_ids = case when lead_department_id is null then '{}'::uuid[] else array[lead_department_id] end
where cardinality(lead_department_ids)=0;

update public.work_programs
set owner_user_ids = case when owner_user_id is null then '{}'::uuid[] else array[owner_user_id] end
where cardinality(owner_user_ids)=0;

alter table public.actions
  add column if not exists collaborating_user_ids uuid[] not null default '{}'::uuid[],
  add column if not exists parent_action_id uuid references public.actions(id) on delete set null;

create index if not exists idx_actions_parent_action_id on public.actions(parent_action_id);

alter table public.external_directives
  add column if not exists document_number text,
  add column if not exists issued_date date,
  add column if not exists effective_date date,
  add column if not exists document_url text;

create table if not exists public.program_reference_links(
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.work_programs(id) on delete cascade,
  directive_id uuid not null references public.external_directives(id) on delete restrict,
  relation_type text not null default 'LEGAL_BASIS',
  sequence_no integer,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(program_id,directive_id)
);

create index if not exists idx_program_reference_links_program on public.program_reference_links(program_id,sequence_no);
create index if not exists idx_program_reference_links_directive on public.program_reference_links(directive_id);

alter table public.program_reference_links enable row level security;

comment on table public.program_reference_links is 'Reusable plan legal/reference basis links. Writes are mediated by plan APIs/service role.';
comment on column public.work_programs.lead_department_ids is 'All co-leading/participating departments; lead_department_id remains the primary compatibility owner.';
comment on column public.work_programs.owner_user_ids is 'All responsible users; owner_user_id remains the primary compatibility owner.';
comment on column public.actions.collaborating_user_ids is 'Additional responsible users besides assignee_user_id.';
comment on column public.actions.parent_action_id is 'Optional parent Action for plan task hierarchy.';
