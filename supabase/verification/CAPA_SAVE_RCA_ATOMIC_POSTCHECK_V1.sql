-- CAPA_SAVE_RCA_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_save_capa_rca_v1(uuid,uuid,text,text)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as capa_lock,
  case when body like '%insert into public.rca_analyses%' and body like '%update public.rca_analyses%' then 'PASS' else 'FAIL' end as create_or_update_rca,
  case when body like '%rca_analysis_id%' then 'PASS' else 'FAIL' end as capa_link,
  case when body like '%capa_save_rca%' then 'PASS' else 'FAIL' end as audit_insert,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_save_capa_rca_v1(uuid,uuid,text,text)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_save_capa_rca_v1(uuid,uuid,text,text)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
