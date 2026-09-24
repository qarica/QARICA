-- QUALITY_RECORD_CONTENT_ATOMIC_POSTCHECK_V1
with fn as (
  select lower(pg_get_functiondef(to_regprocedure(
    'public.qlcl_update_quality_record_content_v1(uuid,uuid,text,text,jsonb,text)'
  ))) as body
)
select
  case when body like '%for update%' then 'PASS' else 'FAIL' end as row_lock,
  case when body like '%public.findings%' and body like '%public.capas%' and body like '%public.risks%' then 'PASS' else 'FAIL' end as domain_coverage,
  case when body like '%update public.records%' then 'PASS' else 'FAIL' end as record_update,
  case when body like '%insert into public.audit_logs%' then 'PASS' else 'FAIL' end as audit_transaction,
  case when not has_function_privilege('authenticated',to_regprocedure('public.qlcl_update_quality_record_content_v1(uuid,uuid,text,text,jsonb,text)'),'EXECUTE') then 'PASS' else 'FAIL' end as authenticated_blocked,
  case when has_function_privilege('service_role',to_regprocedure('public.qlcl_update_quality_record_content_v1(uuid,uuid,text,text,jsonb,text)'),'EXECUTE') then 'PASS' else 'FAIL' end as service_role_allowed
from fn;
