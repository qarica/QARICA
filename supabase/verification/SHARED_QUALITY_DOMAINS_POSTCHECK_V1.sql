-- Shared quality/safety domains postcheck
select
  case when to_regclass('public.quality_domains') is not null then 'PASS' else 'FAIL' end as domains_table,
  case when to_regclass('public.record_quality_domain_links') is not null then 'PASS' else 'FAIL' end as link_table,
  case when to_regprocedure('public.qlcl_set_record_quality_domains_v1(uuid,uuid,jsonb)') is not null then 'PASS' else 'FAIL' end as set_rpc,
  case when (select relrowsecurity from pg_class where oid='public.quality_domains'::regclass) then 'PASS' else 'FAIL' end as domains_rls,
  case when (select relrowsecurity from pg_class where oid='public.record_quality_domain_links'::regclass) then 'PASS' else 'FAIL' end as links_rls,
  case when (select count(*) from public.quality_domains where organization_id is null and is_active) >= 10 then 'PASS' else 'FAIL' end as baseline_domains;

select code,name,sort_order,is_active
from public.quality_domains
where organization_id is null
order by sort_order,name;

select grantee,table_name,privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('quality_domains','record_quality_domain_links')
order by table_name,grantee,privilege_type;
