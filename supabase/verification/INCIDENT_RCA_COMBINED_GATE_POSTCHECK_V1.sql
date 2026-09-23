-- Read-only postcheck for Incident structured RCA + contributing-factor combined gate.

select
  case when to_regclass('public.incident_contributing_factors') is not null then 'PASS' else 'FAIL' end as contributing_factor_table,
  case when to_regclass('public.rca_timeline_events') is not null then 'PASS' else 'FAIL' end as timeline_table,
  case when to_regclass('public.rca_five_whys') is not null then 'PASS' else 'FAIL' end as five_whys_table,
  case when to_regclass('public.rca_fishbone_factors') is not null then 'PASS' else 'FAIL' end as fishbone_table,
  case when to_regclass('public.rca_root_causes') is not null then 'PASS' else 'FAIL' end as root_cause_table,
  case when to_regprocedure('public.qlcl_save_incident_rca_structure_v1(uuid,uuid,jsonb,jsonb,jsonb,jsonb)') is not null then 'PASS' else 'FAIL' end as canonical_rca_save_rpc,
  case when to_regprocedure('public.qlcl_save_incident_contributing_factors_v1(uuid,uuid,text[])') is not null then 'PASS' else 'FAIL' end as factor_save_rpc,
  case when to_regprocedure('public.qlcl_complete_incident_investigation_v1(uuid,uuid,text,text,text,text)') is not null then 'PASS' else 'FAIL' end as completion_rpc,
  case when to_regprocedure('public.qlcl_save_incident_rca_v1(uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,boolean)') is null then 'PASS' else 'FAIL' end as duplicate_rca_rpc_removed;

with fn as (
  select lower(pg_get_functiondef(p.oid)) as body
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='qlcl_complete_incident_investigation_v1'
  limit 1
)
select
  case when body like '%incident_contributing_factors%' then 'PASS' else 'FAIL' end as factor_gate_present,
  case when body like '%rca_timeline_events%' and body ~ 'v_timeline_count[[:space:]]*<[[:space:]]*1' then 'PASS' else 'FAIL' end as timeline_gate_present,
  case when body like '%rca_five_whys%' and body ~ 'v_why_count[[:space:]]*>[[:space:]]*0[[:space:]]+and[[:space:]]+v_why_count[[:space:]]*<[[:space:]]*3' then 'PASS' else 'FAIL' end as optional_five_why_gate_present,
  case when body like '%rca_fishbone_factors%' and body ~ 'v_fishbone_count[[:space:]]*<[[:space:]]*1' then 'PASS' else 'FAIL' end as fishbone_gate_present,
  case when body like '%rca_root_causes%' and body ~ 'v_root_count[[:space:]]*<[[:space:]]*1' then 'PASS' else 'FAIL' end as root_cause_gate_present,
  case when body ~ 'set[[:space:]]+status[[:space:]]*=[[:space:]]*''completed''' then 'PASS' else 'FAIL' end as rca_completion_atomic
from fn;
