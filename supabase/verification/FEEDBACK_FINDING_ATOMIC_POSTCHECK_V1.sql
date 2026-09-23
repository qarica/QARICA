-- FEEDBACK_FINDING_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_create_feedback_finding_v1(uuid,uuid,text,date,text)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as feedback_lock,
  case when body like '%next_record_code%' and body like '%insert into public.records%' then 'PASS' else 'FAIL' end as finding_record_create,
  case when body like '%insert into public.findings%' and body like '%generated_finding%' then 'PASS' else 'FAIL' end as finding_link,
  case when body like '%feedback_create_finding%' then 'PASS' else 'FAIL' end as audit_trace,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_create_feedback_finding_v1(uuid,uuid,text,date,text)'),'EXECUTE') then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_create_feedback_finding_v1(uuid,uuid,text,date,text)'),'EXECUTE') then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
