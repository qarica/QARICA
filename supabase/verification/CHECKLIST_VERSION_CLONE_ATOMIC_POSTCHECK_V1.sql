-- CHECKLIST_VERSION_CLONE_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_clone_checklist_version_v1(uuid,uuid)'
  ))) as body
)
select
  case when body like '%for update of t%' then 'PASS' else 'FAIL' end as template_lock,
  case when body like '%checklist_sections%' and body like '%checklist_items%' and body like '%checklist_item_options%' then 'PASS' else 'FAIL' end as hierarchy_copy,
  case when body like '%checklist_version_create%' then 'PASS' else 'FAIL' end as audit_insert,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_clone_checklist_version_v1(uuid,uuid)'),'EXECUTE') then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_clone_checklist_version_v1(uuid,uuid)'),'EXECUTE') then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
