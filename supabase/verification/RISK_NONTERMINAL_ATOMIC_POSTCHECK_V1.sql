-- RISK_NONTERMINAL_ATOMIC_POSTCHECK_V1
with assess as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_assess_risk_v1(uuid,uuid,integer,integer,text,text)'
  ))) as body
), transition as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_transition_risk_v1(uuid,uuid,text,text)'
  ))) as body
)
select
  case when assess.body like '%for update%' and transition.body like '%for update%' then 'PASS' else 'FAIL' end as row_locks,
  case when assess.body like '%risk_matrix_versions%' and assess.body like '%risk_matrix_cells%' then 'PASS' else 'FAIL' end as matrix_gate,
  case when assess.body like '%risk_assessments%' and assess.body like '%post_treatment%' then 'PASS' else 'FAIL' end as assessment_write,
  case when transition.body like '%risk_action_links%' and transition.body like '%incomplete_action_count%' then 'PASS' else 'FAIL' end as action_gate,
  case when transition.body like '%evidence_links%' and transition.body like '%request_reassessment%' then 'PASS' else 'FAIL' end as evidence_gate,
  case when assess.body like '%audit_logs%' and transition.body like '%audit_logs%' then 'PASS' else 'FAIL' end as audit_events,
  case when not has_function_privilege(
      'authenticated',to_regprocedure('public.qlcl_assess_risk_v1(uuid,uuid,integer,integer,text,text)'),'EXECUTE'
    ) and not has_function_privilege(
      'authenticated',to_regprocedure('public.qlcl_transition_risk_v1(uuid,uuid,text,text)'),'EXECUTE'
    ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
      'service_role',to_regprocedure('public.qlcl_assess_risk_v1(uuid,uuid,integer,integer,text,text)'),'EXECUTE'
    ) and has_function_privilege(
      'service_role',to_regprocedure('public.qlcl_transition_risk_v1(uuid,uuid,text,text)'),'EXECUTE'
    ) then 'PASS' else 'FAIL' end as service_role_allowed
from assess,transition;
