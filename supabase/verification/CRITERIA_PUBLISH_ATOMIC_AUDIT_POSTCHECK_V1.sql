-- CRITERIA_PUBLISH_ATOMIC_AUDIT_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_publish_criteria_version_v1(uuid,uuid,uuid)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as row_lock,
  case when body like '%criteria_set_publish%' then 'PASS' else 'FAIL' end as audit_event,
  case when body like '%status=''retired''%' and body like '%status=''published''%' then 'PASS' else 'FAIL' end as atomic_publish,
  case when body like '%p.is_active=true%' and body like '%organization_id=v_actor.organization_id%' then 'PASS' else 'FAIL' end as org_guard,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_publish_criteria_version_v1(uuid,uuid,uuid)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_publish_criteria_version_v1(uuid,uuid,uuid)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;

select
  case when to_regclass('public.uq_criteria_set_versions_one_published') is not null then 'PASS' else 'FAIL' end
  as single_published_index;
