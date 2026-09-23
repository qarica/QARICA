-- ACTION_VERIFY_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_verify_action_v1(uuid,uuid,text)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as action_lock,
  case when body like '%validity_status=''valid''%' then 'PASS' else 'FAIL' end as evidence_validation,
  case when body like '%action_verify%' then 'PASS' else 'FAIL' end as audit_action,
  case when body like '%workflow_status=''completed''%' then 'PASS' else 'FAIL' end as completion_transition,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_verify_action_v1(uuid,uuid,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_verify_action_v1(uuid,uuid,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
