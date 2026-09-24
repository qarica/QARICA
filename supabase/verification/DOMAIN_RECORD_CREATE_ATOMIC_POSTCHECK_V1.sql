-- DOMAIN_RECORD_CREATE_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_create_domain_record_v1(uuid,text,text,integer,uuid,uuid,jsonb)'
  ))) as body
)
select
  case when body like '%next_record_code%' then 'PASS' else 'FAIL' end as code_generation,
  case when body like '%insert into public.records%' then 'PASS' else 'FAIL' end as record_insert,
  case when body like '%insert into public.incident_reports%' then 'PASS' else 'FAIL' end as incident_report_atomic,
  case when body like '%insert into public.assessment_round_criteria%' then 'PASS' else 'FAIL' end as assessment_criteria_atomic,
  case when body like '%domain_record_create%' then 'PASS' else 'FAIL' end as audit_insert,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_create_domain_record_v1(uuid,text,text,integer,uuid,uuid,jsonb)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_create_domain_record_v1(uuid,text,text,integer,uuid,uuid,jsonb)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
