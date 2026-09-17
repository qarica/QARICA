-- Incident Lessons Learned postcheck V1
select
  case when to_regclass('public.incident_lessons_learned') is not null then 'PASS' else 'FAIL' end as lesson_table,
  case when to_regprocedure('public.qlcl_save_incident_lesson_v1(uuid,uuid,jsonb,boolean)') is not null then 'PASS' else 'FAIL' end as save_publish_rpc,
  case when exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='incident_lessons_learned' and c.relrowsecurity
  ) then 'PASS' else 'FAIL' end as rls_enabled,
  case when position('workflow_status <> ''CLOSED''' in pg_get_functiondef(to_regprocedure('public.qlcl_save_incident_lesson_v1(uuid,uuid,jsonb,boolean)'))) > 0 then 'PASS' else 'FAIL' end as publish_after_close_gate,
  case when position('De-identification confirmation is required' in pg_get_functiondef(to_regprocedure('public.qlcl_save_incident_lesson_v1(uuid,uuid,jsonb,boolean)'))) > 0 then 'PASS' else 'FAIL' end as deidentification_gate;

select grantee,privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='incident_lessons_learned'
order by grantee,privilege_type;
