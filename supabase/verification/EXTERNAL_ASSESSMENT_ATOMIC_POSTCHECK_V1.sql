-- EXTERNAL_ASSESSMENT_ATOMIC_POSTCHECK_V1
select
  case when to_regclass('public.uq_record_links_compared_self_source') is not null then 'PASS' else 'FAIL' end as unique_self_link,
  case when to_regprocedure('public.qlcl_link_external_assessment_self_v1(uuid,uuid,uuid)') is not null then 'PASS' else 'FAIL' end as link_rpc,
  case when to_regprocedure('public.qlcl_save_external_assessment_score_v1(uuid,uuid,uuid,numeric,text)') is not null then 'PASS' else 'FAIL' end as score_rpc,
  case when to_regprocedure('public.qlcl_close_external_assessment_v1(uuid,uuid,text)') is not null then 'PASS' else 'FAIL' end as close_rpc,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_link_external_assessment_self_v1(uuid,uuid,uuid)'),'EXECUTE')
         and not has_function_privilege('authenticated',to_regprocedure('public.qlcl_save_external_assessment_score_v1(uuid,uuid,uuid,numeric,text)'),'EXECUTE')
         and not has_function_privilege('authenticated',to_regprocedure('public.qlcl_close_external_assessment_v1(uuid,uuid,text)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_link_external_assessment_self_v1(uuid,uuid,uuid)'),'EXECUTE')
         and has_function_privilege('service_role',to_regprocedure('public.qlcl_save_external_assessment_score_v1(uuid,uuid,uuid,numeric,text)'),'EXECUTE')
         and has_function_privilege('service_role',to_regprocedure('public.qlcl_close_external_assessment_v1(uuid,uuid,text)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as service_role_allowed;
