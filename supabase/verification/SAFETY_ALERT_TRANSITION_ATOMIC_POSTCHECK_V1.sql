-- SAFETY_ALERT_TRANSITION_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_transition_safety_alert_v1(uuid,uuid,text,text)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as row_locks,
  case when body like '%evidence_links%' and body like '%publish%' then 'PASS' else 'FAIL' end as publish_evidence_gate,
  case when body like '%record_status_history%' and body like '%archived%' then 'PASS' else 'FAIL' end as archive_history,
  case when body like '%safety_alert_%' and body like '%audit_logs%' then 'PASS' else 'FAIL' end as audit_event,
  case when split_part(split_part(body,'update public.safety_alerts',2),'where id=v_alert.id',1) not like '%updated_at%' then 'PASS' else 'FAIL' end as no_invalid_alert_updated_at,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_transition_safety_alert_v1(uuid,uuid,text,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_transition_safety_alert_v1(uuid,uuid,text,text)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
