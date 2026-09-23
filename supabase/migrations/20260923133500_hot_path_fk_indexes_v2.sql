-- QARICA targeted hot-path FK indexes V2.
-- Selected from live pg_stat_user_tables + actual My Work/RBAC/Checklist query paths.
create index if not exists idx_actions_assignee_user_id
  on public.actions(assignee_user_id)
  where assignee_user_id is not null;

create index if not exists idx_actions_lead_department_id
  on public.actions(lead_department_id)
  where lead_department_id is not null;

create index if not exists idx_user_scopes_user_id
  on public.user_scopes(user_id);

create index if not exists idx_user_scopes_department_id
  on public.user_scopes(department_id)
  where department_id is not null;

create index if not exists idx_checklist_items_version_id
  on public.checklist_items(checklist_version_id);

create index if not exists idx_checklist_items_section_id
  on public.checklist_items(section_id)
  where section_id is not null;
