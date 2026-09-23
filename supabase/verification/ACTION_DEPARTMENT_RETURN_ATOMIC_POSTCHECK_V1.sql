-- ACTION_DEPARTMENT_RETURN_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_return_action_department_execution_v1(uuid,uuid,text)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as parent_lock,
  case when body like '%action_department_execution_return%' then 'PASS' else 'FAIL' end as audit_action_type,
  case when body like '%parent_reopened%' then 'PASS' else 'FAIL' end as parent_reopen_state,
  case when body like '%workflow_status=''returned''%' then 'PASS' else 'FAIL' end as execution_return,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_return_action_department_execution_v1(uuid,uuid,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_return_action_department_execution_v1(uuid,uuid,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
