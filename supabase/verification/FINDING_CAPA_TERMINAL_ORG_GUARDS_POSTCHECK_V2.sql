-- FINDING_CAPA_TERMINAL_ORG_GUARDS_POSTCHECK_V2
with fns as (
  select p.proname, lower(pg_get_functiondef(p.oid)) as body, p.oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in (
      'qlcl_accept_and_close_finding_v1',
      'qlcl_close_capa_v1',
      'qlcl_escalate_finding_to_capa_v1'
    )
)
select
  case when count(*)=3 then 'PASS' else 'FAIL' end as functions_present,
  case when bool_and(body like '%public.profiles%' and body like '%p.is_active=true%' and body like '%p.organization_id=r.organization_id%') then 'PASS' else 'FAIL' end as actor_org_guard,
  case when bool_and(body like '%for update%') then 'PASS' else 'FAIL' end as row_locks,
  case when bool_and(not has_function_privilege('authenticated',oid,'EXECUTE')) then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when bool_and(has_function_privilege('service_role',oid,'EXECUTE')) then 'PASS' else 'FAIL' end as service_role_allowed
from fns;

select
  case when position('next_record_code(v_record.organization_id' in lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_escalate_finding_to_capa_v1(uuid,uuid,text,text)'
  )))) > 0 then 'PASS' else 'FAIL' end as canonical_code_allocator;
