-- INCIDENT_CAPA_CREATE_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_create_capa_from_incident_v1(uuid,uuid,text,text,text,boolean,date)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as row_locks,
  case when body like '%public.profiles%' and body like '%is_active=true%' and body like '%organization_id=v_actor.organization_id%' then 'PASS' else 'FAIL' end as actor_org_guard,
  case when body like '%rca_required%' and body like '%status=''completed''%' then 'PASS' else 'FAIL' end as rca_gate,
  case when body like '%generated_capa%' and body like '%generate_capa_from_incident%' then 'PASS' else 'FAIL' end as link_audit,
  case when not has_function_privilege(
    'authenticated',
    to_regprocedure('public.qlcl_create_capa_from_incident_v1(uuid,uuid,text,text,text,boolean,date)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege(
    'service_role',
    to_regprocedure('public.qlcl_create_capa_from_incident_v1(uuid,uuid,text,text,text,boolean,date)'),
    'EXECUTE'
  ) then 'PASS' else 'FAIL' end as service_role_allowed
from fn;

select
  case when to_regclass('public.uq_record_links_one_generated_capa_per_incident') is not null then 'PASS' else 'FAIL' end
  as one_capa_guard;
