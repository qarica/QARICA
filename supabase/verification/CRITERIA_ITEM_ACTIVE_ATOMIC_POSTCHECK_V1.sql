-- CRITERIA_ITEM_ACTIVE_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_set_criteria_item_active_v1(uuid,uuid,boolean)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as row_lock,
  case when body like '%parent_criteria_item_id%' and body like '%children_deactivated%' then 'PASS' else 'FAIL' end as child_cascade,
  case when body like '%criteria_item_active_state%' and body like '%audit_logs%' then 'PASS' else 'FAIL' end as audit_insert,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_set_criteria_item_active_v1(uuid,uuid,boolean)'),'EXECUTE') then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_set_criteria_item_active_v1(uuid,uuid,boolean)'),'EXECUTE') then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
