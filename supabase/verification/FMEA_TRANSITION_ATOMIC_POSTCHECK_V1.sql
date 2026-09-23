-- FMEA_TRANSITION_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_transition_fmea_v1(uuid,uuid,text,text)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as row_locks,
  case when body like '%fmea_mode_assessments%' and body like '%baseline%' then 'PASS' else 'FAIL' end as baseline_gate,
  case when body like '%fmea_failure_mode_action_links%' and body like '%record_links%' then 'PASS' else 'FAIL' end as mode_action_trace_gate,
  case when body like '%evidence_links%' and body like '%residual_review%' then 'PASS' else 'FAIL' end as residual_evidence_gate,
  case when body like '%fmea_%' and body like '%audit_logs%' then 'PASS' else 'FAIL' end as audit_event,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_transition_fmea_v1(uuid,uuid,text,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_transition_fmea_v1(uuid,uuid,text,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
