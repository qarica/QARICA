-- RECORD_LIFECYCLE_ORG_DOMAIN_POSTCHECK_V2
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_change_record_lifecycle_v1(uuid,uuid,text,text)'
  ))) as body
)
select
  case when body like '%public.profiles%' and body like '%organization_id%' and body like '%is_active=true%' then 'PASS' else 'FAIL' end as actor_org_guard,
  case when body like '%feedback_records%' and body like '%record_type=''feedback''%' then 'PASS' else 'FAIL' end as feedback_sync,
  case when body like '%external_directives%' and body like '%record_type=''directive''%' then 'PASS' else 'FAIL' end as directive_sync,
  case when body like '%for update%' then 'PASS' else 'FAIL' end as row_lock,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_change_record_lifecycle_v1(uuid,uuid,text,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_change_record_lifecycle_v1(uuid,uuid,text,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
