-- HOT_PATH_FK_INDEXES_V2_POSTCHECK
select
  case when to_regclass('public.idx_actions_assignee_user_id') is not null then 'PASS' else 'FAIL' end as actions_assignee,
  case when to_regclass('public.idx_actions_lead_department_id') is not null then 'PASS' else 'FAIL' end as actions_department,
  case when to_regclass('public.idx_user_scopes_user_id') is not null then 'PASS' else 'FAIL' end as user_scope_user,
  case when to_regclass('public.idx_user_scopes_department_id') is not null then 'PASS' else 'FAIL' end as user_scope_department,
  case when to_regclass('public.idx_checklist_items_version_id') is not null then 'PASS' else 'FAIL' end as checklist_version,
  case when to_regclass('public.idx_checklist_items_section_id') is not null then 'PASS' else 'FAIL' end as checklist_section;
