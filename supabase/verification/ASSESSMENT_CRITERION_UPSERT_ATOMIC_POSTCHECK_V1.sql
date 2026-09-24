-- ASSESSMENT_CRITERION_UPSERT_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_save_criterion_assessment_v1(uuid,uuid,uuid,text,numeric,text,text)'
  ))) as body
)
select
  case when body like '%on conflict (assessment_round_id,criteria_item_id)%' then 'PASS' else 'FAIL' end as atomic_upsert,
  case when body like '%applicability_status%' and body like '%<>''applicable''%' then 'PASS' else 'FAIL' end as applicability_gate,
  case when body like '%lead_department_id%' and body like '%support_department_ids%' then 'PASS' else 'FAIL' end as department_scope_gate,
  case when body like '%criterion_assessments%' and body like '%for update%' then 'PASS' else 'FAIL' end as terminal_state_lock,
  case when body like '%audit_logs%' then 'PASS' else 'FAIL' end as audit_insert,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_save_criterion_assessment_v1(uuid,uuid,uuid,text,numeric,text,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_save_criterion_assessment_v1(uuid,uuid,uuid,text,numeric,text,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
