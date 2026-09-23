-- CAPA_CORE_TRANSITION_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_transition_capa_v1(uuid,uuid,text,text,text)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as capa_lock,
  case when body like '%pending_approval%' and body like '%approved_by%' then 'PASS' else 'FAIL' end as approval_flow,
  case when body like '%required_resources%' then 'PASS' else 'FAIL' end as resources_flow,
  case when body like '%capa_%' and body like '%audit_logs%' then 'PASS' else 'FAIL' end as audit_insert,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_transition_capa_v1(uuid,uuid,text,text,text)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_transition_capa_v1(uuid,uuid,text,text,text)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
