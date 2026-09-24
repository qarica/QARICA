-- RCA_REVISION_CONCURRENCY_POSTCHECK_V2
select
  case when exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='rca_analyses' and column_name='revision'
  ) then 'PASS' else 'FAIL' end as revision_column,
  case when to_regprocedure('public.qlcl_save_incident_rca_structure_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb,bigint)') is not null then 'PASS' else 'FAIL' end as save_v2,
  case when lower(pg_get_functiondef(to_regprocedure('public.qlcl_save_incident_rca_structure_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb,bigint)'))) like '%revision <> p_expected_revision%' then 'PASS' else 'FAIL' end as conflict_gate,
  case when lower(pg_get_functiondef(to_regprocedure('public.qlcl_save_incident_rca_structure_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb,bigint)'))) like '%for update%' then 'PASS' else 'FAIL' end as row_lock,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_save_incident_rca_structure_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb,bigint)'),'EXECUTE') then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_save_incident_rca_structure_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb,bigint)'),'EXECUTE') then 'PASS' else 'FAIL' end as service_role_allowed;
