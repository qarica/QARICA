-- ACTION_DEPARTMENT_START_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_start_action_department_execution_v1(uuid,uuid,text)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as parent_lock,
  case when body like '%action_department_execution_start%' then 'PASS' else 'FAIL' end as start_audit,
  case when body like '%action_department_execution_resume%' then 'PASS' else 'FAIL' end as resume_audit,
  case when body like '%parent_started%' then 'PASS' else 'FAIL' end as parent_transition,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_start_action_department_execution_v1(uuid,uuid,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_start_action_department_execution_v1(uuid,uuid,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
