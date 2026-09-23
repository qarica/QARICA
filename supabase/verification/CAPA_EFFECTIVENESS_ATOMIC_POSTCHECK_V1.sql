-- CAPA_EFFECTIVENESS_ATOMIC_POSTCHECK_V1
with req as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_request_capa_effectiveness_v1(uuid,uuid)'
  ))) as body
), rev as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_review_capa_effectiveness_v1(uuid,uuid,text,text,text,text,text)'
  ))) as body
)
select
  case when req.body like '%for update%' and rev.body like '%for update%' then 'PASS' else 'FAIL' end as row_locks,
  case when req.body like '%corrective%' and req.body like '%preventive%' then 'PASS' else 'FAIL' end as action_type_gate,
  case when req.body like '%evidence_links%' and req.body like '%required_resources%' then 'PASS' else 'FAIL' end as effectiveness_gate,
  case when rev.body like '%capa_effectiveness_reviews%' and rev.body like '%partially_effective%' then 'PASS' else 'FAIL' end as review_transaction,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_request_capa_effectiveness_v1(uuid,uuid)'),'EXECUTE')
         and not has_function_privilege('authenticated',to_regprocedure('public.qlcl_review_capa_effectiveness_v1(uuid,uuid,text,text,text,text,text)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_request_capa_effectiveness_v1(uuid,uuid)'),'EXECUTE')
         and has_function_privilege('service_role',to_regprocedure('public.qlcl_review_capa_effectiveness_v1(uuid,uuid,text,text,text,text,text)'),'EXECUTE')
       then 'PASS' else 'FAIL' end as service_role_allowed
from req,rev;
