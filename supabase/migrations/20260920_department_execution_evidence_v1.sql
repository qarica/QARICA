-- Scope evidence to one department execution when a hospital-wide Action is executed by many departments.
alter table public.evidence_links
  add column if not exists action_department_execution_id uuid
  references public.action_department_executions(id) on delete set null;

create index if not exists evidence_links_action_department_execution_idx
  on public.evidence_links(action_department_execution_id)
  where action_department_execution_id is not null;

comment on column public.evidence_links.action_department_execution_id is
'Optional department execution that produced this evidence. Null for ordinary USER/GROUP Actions; required by application flow for DEPARTMENT Actions.';
