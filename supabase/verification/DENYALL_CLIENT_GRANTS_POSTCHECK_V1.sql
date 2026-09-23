-- DENYALL_CLIENT_GRANTS_POSTCHECK_V1
with targets(table_name) as (
  values ('fmea_failure_mode_action_links'::text),('program_reference_links'::text)
)
select
  case when count(*) filter (
    where g.grantee in ('anon','authenticated','PUBLIC')
  ) = 0 then 'PASS' else 'FAIL' end as client_grants_revoked,
  case when count(*) filter (
    where g.grantee='service_role' and g.privilege_type='SELECT'
  ) = 2 then 'PASS' else 'FAIL' end as service_role_select_kept
from targets t
left join information_schema.role_table_grants g
  on g.table_schema='public' and g.table_name=t.table_name;
