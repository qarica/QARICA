-- RCA -> Action/CAPA traceability postcheck
select
  case when to_regclass('public.rca_root_cause_action_links') is not null then 'PASS' else 'FAIL' end as link_table,
  case when exists(select 1 from pg_constraint where conname='capas_rca_analysis_id_fkey' and conrelid='public.capas'::regclass) then 'PASS' else 'FAIL' end as capa_rca_fk,
  case when to_regprocedure('public.qlcl_attach_action_root_causes_v1(uuid,uuid,uuid,jsonb)') is not null then 'PASS' else 'FAIL' end as attach_rpc,
  case when to_regprocedure('public.qlcl_incident_action_trace_state_v1(uuid)') is not null then 'PASS' else 'FAIL' end as trace_rpc,
  case when exists(select 1 from pg_trigger where tgname='trg_incident_ready_to_close_gate_v1' and not tgisinternal) then 'PASS' else 'FAIL' end as ready_gate_trigger,
  case when position('insert into actions(record_id,title' in lower(pg_get_functiondef(to_regprocedure('public.qlcl_create_linked_action_v1(uuid,uuid,jsonb)')))) > 0 then 'PASS' else 'FAIL' end as action_title_fix,
  case when position('root_cause_ids' in pg_get_functiondef(to_regprocedure('public.qlcl_create_linked_action_v1(uuid,uuid,jsonb)'))) > 0 then 'PASS' else 'FAIL' end as create_action_root_trace,
  case when position('ineffective_capa_count' in pg_get_functiondef(to_regprocedure('public.qlcl_close_incident_v1(uuid,uuid,text)'))) > 0 then 'PASS' else 'FAIL' end as capa_effectiveness_close_gate;

select grantee,privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='rca_root_cause_action_links'
order by grantee,privilege_type;
