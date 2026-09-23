-- ASSESSMENT_TRANSITION_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_transition_assessment_round_v1(uuid,uuid,text,text)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as round_lock,
  case when body like '%criterion_responsibilities%' and body like '%responsibility_snapshot_at%' then 'PASS' else 'FAIL' end as snapshot_gate,
  case when body like '%not_applicable_reason%' and body like '%missing_lead%' then 'PASS' else 'FAIL' end as start_gate,
  case when body like '%criterion_assessments%' and body like '%reviewing%' then 'PASS' else 'FAIL' end as review_gate,
  case when body like '%audit_logs%' then 'PASS' else 'FAIL' end as audit_insert,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_transition_assessment_round_v1(uuid,uuid,text,text)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_transition_assessment_round_v1(uuid,uuid,text,text)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
