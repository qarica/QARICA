-- RECURRING_AUTOMATION_SOURCE_V2_POSTCHECK
with checks as (
  select 'source_columns' as check_name,
    case when (
      select count(*) from information_schema.columns
      where table_schema='public' and table_name='recurring_work_templates'
        and column_name in ('source_code','source_label','source_criteria','automation_kind','automation_ref_id','automation_target_department_id','automation_target_area')
    )=7 then 'PASS' else 'FAIL' end as result
  union all
  select 'run_output_trace',
    case when exists(
      select 1 from information_schema.columns
      where table_schema='public' and table_name='recurring_work_runs' and column_name='generated_output_record_id'
    ) then 'PASS' else 'FAIL' end
  union all
  select 'materialize_rpc',
    case when to_regprocedure('public.qlcl_materialize_recurring_run_v2(uuid,uuid)') is not null then 'PASS' else 'FAIL' end
  union all
  select 'service_role_execute',
    case when has_function_privilege('service_role','public.qlcl_materialize_recurring_run_v2(uuid,uuid)','EXECUTE') then 'PASS' else 'FAIL' end
  union all
  select 'authenticated_denied',
    case when not has_function_privilege('authenticated','public.qlcl_materialize_recurring_run_v2(uuid,uuid)','EXECUTE') then 'PASS' else 'FAIL' end
  union all
  select 'anon_denied',
    case when not has_function_privilege('anon','public.qlcl_materialize_recurring_run_v2(uuid,uuid)','EXECUTE') then 'PASS' else 'FAIL' end
  union all
  select 'no_e2e_residue',
    case when not exists(select 1 from public.records where title like '[E2E TEST]%')
      and not exists(select 1 from public.recurring_work_templates where source_code like 'E2E-%')
    then 'PASS' else 'FAIL' end
)
select * from checks order by check_name;
