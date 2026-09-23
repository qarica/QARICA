-- REPORT_TRANSITION_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_transition_report_v1(uuid,uuid,text,text)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as row_locks,
  case when body like '%record_links%' and body like '%evidence_links%' then 'PASS' else 'FAIL' end as review_gates,
  case when body like '%report_%' and body like '%audit_logs%' then 'PASS' else 'FAIL' end as audit_event,
  case when body like '%submit_review%' and body like '%reviewing%' then 'PASS' else 'FAIL' end as review_transition,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_transition_report_v1(uuid,uuid,text,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_transition_report_v1(uuid,uuid,text,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
