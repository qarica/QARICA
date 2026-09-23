-- CAPA_START_ACTIONS_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_start_capa_actions_v1(uuid,uuid)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as capa_lock,
  case when body like '%rca_analyses%' and body like '%completed%' then 'PASS' else 'FAIL' end as rca_gate,
  case when body like '%corrective%' and body like '%preventive%' then 'PASS' else 'FAIL' end as action_type_gate,
  case when body like '%capa_start_actions%' then 'PASS' else 'FAIL' end as audit_insert,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_start_capa_actions_v1(uuid,uuid)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_start_capa_actions_v1(uuid,uuid)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
