-- ACTION_VERIFY_AUDIT_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_verify_action_department_execution_v1(uuid,uuid,text)'
  ))) as body
)
select
  case when body like '%insert into public.audit_logs%' then 'PASS' else 'FAIL' end as audit_insert,
  case when body like '%action_department_execution_verify%' then 'PASS' else 'FAIL' end as audit_action_type,
  case when body like '%aggregate_complete%' then 'PASS' else 'FAIL' end as aggregate_state_logged,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_verify_action_department_execution_v1(uuid,uuid,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_verify_action_department_execution_v1(uuid,uuid,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
