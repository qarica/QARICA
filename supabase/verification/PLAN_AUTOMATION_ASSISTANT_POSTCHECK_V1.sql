-- PLAN_AUTOMATION_ASSISTANT_POSTCHECK_V1
-- Structural and safety postcheck for Plan -> Action + Indicator/Monitoring automation.

with checks as (
  select 'approve_v3_rpc' as check_name,
         case when to_regprocedure('public.qlcl_approve_plan_bundle_v3(uuid,uuid)') is not null then 'PASS' else 'FAIL' end as result
  union all
  select 'approve_v2_compat_wrapper',
         case when to_regprocedure('public.qlcl_approve_plan_bundle_v2(uuid,uuid)') is not null then 'PASS' else 'FAIL' end
  union all
  select 'v3_service_role_execute',
         case when has_function_privilege('service_role','public.qlcl_approve_plan_bundle_v3(uuid,uuid)','EXECUTE') then 'PASS' else 'FAIL' end
  union all
  select 'v3_authenticated_denied',
         case when not has_function_privilege('authenticated','public.qlcl_approve_plan_bundle_v3(uuid,uuid)','EXECUTE') then 'PASS' else 'FAIL' end
  union all
  select 'v3_anon_denied',
         case when not has_function_privilege('anon','public.qlcl_approve_plan_bundle_v3(uuid,uuid)','EXECUTE') then 'PASS' else 'FAIL' end
  union all
  select 'plan_auto_indicator_trace_support',
         case when exists(
           select 1
           from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public'
             and p.proname='qlcl_approve_plan_bundle_v3'
             and pg_get_functiondef(p.oid) like '%INDICATOR_MEASUREMENT%'
             and pg_get_functiondef(p.oid) like '%MATERIALIZES%'
         ) then 'PASS' else 'FAIL' end
  union all
  select 'plan_auto_monitoring_trace_support',
         case when exists(
           select 1
           from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public'
             and p.proname='qlcl_approve_plan_bundle_v3'
             and pg_get_functiondef(p.oid) like '%monitoring_rounds%'
             and pg_get_functiondef(p.oid) like '%MATERIALIZES%'
         ) then 'PASS' else 'FAIL' end
  union all
  select 'no_e2e_test_residue',
         case when not exists(
           select 1 from public.records
           where title like '[E2E TEST]%'
              or metadata->>'e2e_test'='true'
         ) then 'PASS' else 'FAIL' end
)
select * from checks order by check_name;
