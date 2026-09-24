-- FMEA_SCORE_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_score_fmea_mode_v1(uuid,uuid,uuid,text,integer,integer,integer,text)'
  ))) as body
)
select
  case when body like '%for update of s%' then 'PASS' else 'FAIL' end as study_lock,
  case when body like '%fmea_mode_assessments%' then 'PASS' else 'FAIL' end as assessment_insert,
  case when body like '%fmea_baseline_score%' and body like '%fmea_residual_score%' then 'PASS' else 'FAIL' end as audit_types,
  case when body like '%residual_review%' and body like '%draft%' then 'PASS' else 'FAIL' end as state_gates,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_score_fmea_mode_v1(uuid,uuid,uuid,text,integer,integer,integer,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_score_fmea_mode_v1(uuid,uuid,uuid,text,integer,integer,integer,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
