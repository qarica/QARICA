-- FMEA_SETUP_SCHEMA_ATOMIC_POSTCHECK_V1
select
  case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='fmea_process_steps' and column_name='responsible_department_id') then 'PASS' else 'FAIL' end as step_department_column,
  case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='fmea_failure_modes' and column_name='current_control') then 'PASS' else 'FAIL' end as current_control_column,
  case when to_regprocedure('public.qlcl_add_fmea_step_v1(uuid,uuid,integer,text,text,uuid)') is not null then 'PASS' else 'FAIL' end as step_rpc,
  case when to_regprocedure('public.qlcl_add_fmea_mode_v1(uuid,uuid,uuid,text,text,text,text,boolean)') is not null then 'PASS' else 'FAIL' end as mode_rpc,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_add_fmea_step_v1(uuid,uuid,integer,text,text,uuid)'),'EXECUTE')
         and not has_function_privilege('authenticated',to_regprocedure('public.qlcl_add_fmea_mode_v1(uuid,uuid,uuid,text,text,text,text,boolean)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_add_fmea_step_v1(uuid,uuid,integer,text,text,uuid)'),'EXECUTE')
         and has_function_privilege('service_role',to_regprocedure('public.qlcl_add_fmea_mode_v1(uuid,uuid,uuid,text,text,text,text,boolean)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as service_role_allowed;
