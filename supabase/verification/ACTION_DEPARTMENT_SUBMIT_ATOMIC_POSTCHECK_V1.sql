-- ACTION_DEPARTMENT_SUBMIT_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_submit_action_department_execution_v1(uuid,uuid)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as parent_lock,
  case when body like '%action_department_execution_submit%' then 'PASS' else 'FAIL' end as audit_action_type,
  case when body like '%evidence_required%' then 'PASS' else 'FAIL' end as evidence_gate,
  case when body like '%remaining_execution_count%' then 'PASS' else 'FAIL' end as aggregate_gate,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_submit_action_department_execution_v1(uuid,uuid)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_submit_action_department_execution_v1(uuid,uuid)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
