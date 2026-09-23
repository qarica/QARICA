-- CHECKLIST_TEMPLATE_CREATE_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_create_checklist_template_v1(uuid,text,text,text,uuid,text)'
  ))) as body
)
select
  case when body like '%qlcl_next_master_code_v1%' then 'PASS' else 'FAIL' end as code_generation,
  case when body like '%insert into public.checklist_templates%' then 'PASS' else 'FAIL' end as template_insert,
  case when body like '%insert into public.checklist_versions%' then 'PASS' else 'FAIL' end as version_insert,
  case when body like '%checklist_template_create%' then 'PASS' else 'FAIL' end as audit_insert,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_create_checklist_template_v1(uuid,text,text,text,uuid,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_create_checklist_template_v1(uuid,text,text,text,uuid,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
