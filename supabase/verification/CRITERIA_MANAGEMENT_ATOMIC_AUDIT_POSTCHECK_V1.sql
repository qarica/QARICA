-- CRITERIA_MANAGEMENT_ATOMIC_AUDIT_POSTCHECK_V1
with create_set as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_create_criteria_set_v1(uuid,text,text,text,date)'
  ))) as body
), create_item as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_create_criteria_item_v1(uuid,uuid,text,text,text,uuid,text,integer,text,text,integer,boolean,boolean,numeric)'
  ))) as body
), create_revision as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_create_criteria_revision_v1(uuid,uuid,date)'
  ))) as body
)
select
  case when create_set.body like '%criteria_set_create%' and create_set.body like '%criteria_set_versions%' then 'PASS' else 'FAIL' end as set_create_audit,
  case when create_item.body like '%criteria_item_create%' and create_item.body like '%for update%' then 'PASS' else 'FAIL' end as item_create_audit_lock,
  case when create_revision.body like '%criteria_version_create%' and create_revision.body like '%parent_criteria_item_id%' then 'PASS' else 'FAIL' end as revision_clone_audit,
  case when
    not has_function_privilege('authenticated',to_regprocedure('public.qlcl_create_criteria_set_v1(uuid,text,text,text,date)'),'EXECUTE')
    and not has_function_privilege('authenticated',to_regprocedure('public.qlcl_create_criteria_item_v1(uuid,uuid,text,text,text,uuid,text,integer,text,text,integer,boolean,boolean,numeric)'),'EXECUTE')
    and not has_function_privilege('authenticated',to_regprocedure('public.qlcl_create_criteria_revision_v1(uuid,uuid,date)'),'EXECUTE')
  then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when
    has_function_privilege('service_role',to_regprocedure('public.qlcl_create_criteria_set_v1(uuid,text,text,text,date)'),'EXECUTE')
    and has_function_privilege('service_role',to_regprocedure('public.qlcl_create_criteria_item_v1(uuid,uuid,text,text,text,uuid,text,integer,text,text,integer,boolean,boolean,numeric)'),'EXECUTE')
    and has_function_privilege('service_role',to_regprocedure('public.qlcl_create_criteria_revision_v1(uuid,uuid,date)'),'EXECUTE')
  then 'PASS' else 'FAIL' end as service_role_allowed
from create_set,create_item,create_revision;
