-- FEEDBACK_TRANSITION_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_transition_feedback_v1(uuid,uuid,text,text)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as row_locks,
  case when body like '%owner_department_id%' and body like '%related_department_id%' then 'PASS' else 'FAIL' end as coordination_gate,
  case when body like '%evidence_links%' and body like '%mark_responded%' then 'PASS' else 'FAIL' end as response_evidence_gate,
  case when body like '%feedback_%' and body like '%audit_logs%' then 'PASS' else 'FAIL' end as audit_event,
  case when split_part(split_part(body,'update public.feedback_records',2),'where id=v_feedback.id',1) not like '%updated_at%' then 'PASS' else 'FAIL' end as no_invalid_updated_at,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_transition_feedback_v1(uuid,uuid,text,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_transition_feedback_v1(uuid,uuid,text,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
