-- INSPECTION_TRANSITION_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_transition_inspection_v1(uuid,uuid,text,text)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as row_locks,
  case when body like '%asia/ho_chi_minh%' and body like '%visit_date%' then 'PASS' else 'FAIL' end as visit_date_gate,
  case when body like '%inspection_%' and body like '%audit_logs%' then 'PASS' else 'FAIL' end as audit_event,
  case when body like '%start_visit%' and body like '%complete_visit%' then 'PASS' else 'FAIL' end as transitions_present,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_transition_inspection_v1(uuid,uuid,text,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_transition_inspection_v1(uuid,uuid,text,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
