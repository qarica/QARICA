-- Read-only postcheck for structured incident RCA.

select
  case when to_regclass('public.rca_timeline_events') is not null then 'PASS' else 'FAIL' end as timeline_table,
  case when to_regclass('public.rca_five_whys') is not null then 'PASS' else 'FAIL' end as five_whys_table,
  case when to_regclass('public.rca_fishbone_factors') is not null then 'PASS' else 'FAIL' end as fishbone_table,
  case when to_regclass('public.rca_root_causes') is not null then 'PASS' else 'FAIL' end as root_causes_table;

select
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='qlcl_save_incident_rca_structure_v1'
  ) then 'PASS' else 'FAIL' end as save_rpc,
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='qlcl_complete_incident_investigation_v1'
      and pg_get_functiondef(p.oid) like '%rca_timeline_events%'
      and pg_get_functiondef(p.oid) like '%rca_five_whys%'
      and pg_get_functiondef(p.oid) like '%rca_fishbone_factors%'
      and pg_get_functiondef(p.oid) like '%rca_root_causes%'
  ) then 'PASS' else 'FAIL' end as completion_gate;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('rca_timeline_events','rca_five_whys','rca_fishbone_factors','rca_root_causes')
order by c.relname;

select
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('qlcl_save_incident_rca_structure_v1','qlcl_complete_incident_investigation_v1')
order by p.proname;

select
  (select count(*) from public.rca_timeline_events) as timeline_rows,
  (select count(*) from public.rca_five_whys) as five_why_rows,
  (select count(*) from public.rca_fishbone_factors) as fishbone_rows,
  (select count(*) from public.rca_root_causes) as root_cause_rows;
