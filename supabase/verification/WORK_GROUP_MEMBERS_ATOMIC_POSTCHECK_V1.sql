-- WORK_GROUP_MEMBERS_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_update_work_group_v1(uuid,uuid,jsonb)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as group_lock,
  case when body like '%on conflict (group_id,user_id)%' then 'PASS' else 'FAIL' end as member_upsert,
  case when body like '%left_at%' and body like '%jsonb_to_recordset%' then 'PASS' else 'FAIL' end as member_deactivation,
  case when body like '%work_group_update%' and body like '%audit_logs%' then 'PASS' else 'FAIL' end as audit_insert,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_update_work_group_v1(uuid,uuid,jsonb)'),'EXECUTE') then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_update_work_group_v1(uuid,uuid,jsonb)'),'EXECUTE') then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
