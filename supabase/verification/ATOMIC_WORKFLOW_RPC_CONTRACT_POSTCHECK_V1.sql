-- ATOMIC_WORKFLOW_RPC_CONTRACT_POSTCHECK_V1
with expected(proname) as (
  values
    ('qlcl_start_action_department_execution_v1'),
    ('qlcl_submit_action_department_execution_v1'),
    ('qlcl_return_action_department_execution_v1'),
    ('qlcl_verify_action_department_execution_v1'),
    ('qlcl_verify_action_v1'),
    ('qlcl_create_checklist_template_v1'),
    ('qlcl_request_capa_effectiveness_v1'),
    ('qlcl_review_capa_effectiveness_v1'),
    ('qlcl_create_feedback_finding_v1'),
    ('qlcl_close_feedback_v1'),
    ('qlcl_transition_feedback_v1'),
    ('qlcl_transition_directive_v1'),
    ('qlcl_transition_report_v1'),
    ('qlcl_transition_safety_alert_v1'),
    ('qlcl_transition_inspection_v1'),
    ('qlcl_transition_fmea_v1'),
    ('qlcl_transition_risk_v1')
), actual as (
  select e.proname,
         p.oid,
         p.prosecdef,
         has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
         has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_execute
  from expected e
  left join pg_proc p on p.proname=e.proname
  left join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
)
select
  case when count(*)=17 then 'PASS' else 'FAIL' end as expected_rpc_count,
  case when count(*) filter (where oid is null)=0 then 'PASS' else 'FAIL' end as all_rpcs_exist,
  case when count(*) filter (where not coalesce(prosecdef,false))=0 then 'PASS' else 'FAIL' end as security_definer_contract,
  case when count(*) filter (where coalesce(authenticated_execute,false))=0 then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when count(*) filter (where not coalesce(service_role_execute,false))=0 then 'PASS' else 'FAIL' end as service_role_allowed
from actual;
