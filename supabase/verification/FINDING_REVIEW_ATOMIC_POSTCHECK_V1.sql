-- FINDING_REVIEW_ATOMIC_POSTCHECK_V1
select
  case when to_regprocedure('public.qlcl_return_finding_v1(uuid,uuid,date,text)') is not null then 'PASS' else 'FAIL' end as return_rpc,
  case when to_regprocedure('public.qlcl_accept_and_close_finding_v1(uuid,uuid,text)') is not null then 'PASS' else 'FAIL' end as accept_rpc,
  case when to_regprocedure('public.qlcl_escalate_finding_to_capa_v1(uuid,uuid,text,text)') is not null then 'PASS' else 'FAIL' end as escalate_rpc,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_return_finding_v1(uuid,uuid,date,text)'),'EXECUTE')
         and not has_function_privilege('authenticated',to_regprocedure('public.qlcl_accept_and_close_finding_v1(uuid,uuid,text)'),'EXECUTE')
         and not has_function_privilege('authenticated',to_regprocedure('public.qlcl_escalate_finding_to_capa_v1(uuid,uuid,text,text)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_return_finding_v1(uuid,uuid,date,text)'),'EXECUTE')
         and has_function_privilege('service_role',to_regprocedure('public.qlcl_accept_and_close_finding_v1(uuid,uuid,text)'),'EXECUTE')
         and has_function_privilege('service_role',to_regprocedure('public.qlcl_escalate_finding_to_capa_v1(uuid,uuid,text,text)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as service_role_allowed;
