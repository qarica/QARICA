-- RECURRING_FORMAL_V5_POSTCHECK
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_materialize_recurring_run_v5(uuid,uuid)'
  ))) as body
)
select
  case when body like '%assignment_target_type%' and body like '%assignee_group_id%' then 'PASS' else 'FAIL' end as group_assignment,
  case when body like '%work_group_assignment_snapshots%' then 'PASS' else 'FAIL' end as group_snapshot,
  case when body like '%automation_kind=''monitoring''%' and body like '%automation_kind=''report''%' then 'PASS' else 'FAIL' end as formal_outputs,
  case when body like '%for update%' then 'PASS' else 'FAIL' end as row_locks,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_materialize_recurring_run_v5(uuid,uuid)'),'EXECUTE') then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_materialize_recurring_run_v5(uuid,uuid)'),'EXECUTE') then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
