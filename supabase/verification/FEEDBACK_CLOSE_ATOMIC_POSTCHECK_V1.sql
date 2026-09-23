-- FEEDBACK_CLOSE_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_close_feedback_v1(uuid,uuid,text)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as row_lock,
  case when body like '%feedback_records%' and body like '%records%' then 'PASS' else 'FAIL' end as dual_close,
  case when body like '%record_status_history%' then 'PASS' else 'FAIL' end as status_history,
  case when body like '%feedback_close%' then 'PASS' else 'FAIL' end as audit_event,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_close_feedback_v1(uuid,uuid,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_close_feedback_v1(uuid,uuid,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
