-- TENANT_READ_BOUNDARY_POSTCHECK_V1
-- Read-only regression guard for QARICA multi-tenant isolation.
-- The allowlist contains global reference/catalog tables by current design.

with allowed_global(tablename) as (
  values
    ('fmea_scoring_model_versions'::text),
    ('permissions'),
    ('record_types'),
    ('risk_matrix_cells'),
    ('risk_matrix_versions'),
    ('role_permissions'),
    ('roles')
),
unexpected as (
  select p.tablename, p.policyname
  from pg_policies p
  where p.schemaname='public'
    and p.cmd='SELECT'
    and trim(coalesce(p.qual,''))='true'
    and not exists (
      select 1 from allowed_global a where a.tablename=p.tablename
    )
)
select
  case when count(*)=0 then 'PASS' else 'FAIL' end as tenant_select_policy_gate,
  count(*) as unexpected_permissive_policies,
  coalesce(array_agg(tablename||':'||policyname order by tablename) filter (where tablename is not null),'{}'::text[]) as unexpected
from unexpected;

select
  c.relname as view_name,
  case when coalesce(c.reloptions,'{}'::text[]) @> array['security_invoker=true']::text[]
       then 'PASS' else 'FAIL' end as security_invoker_gate
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('vw_actions_dashboard','vw_program_progress')
order by c.relname;

select
  p.proname,
  case when not has_function_privilege('anon',p.oid,'EXECUTE')
       then 'PASS' else 'FAIL' end as anon_execute_gate
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'can_create_record_type',
    'has_permission',
    'mark_own_notifications_read',
    'next_record_code',
    'qlcl_ensure_department_action_execution_v1',
    'qlcl_handle_new_auth_user',
    'qlcl_materialize_recurring_run_v4',
    'qlcl_sync_record_link_traceability_v1'
  )
order by p.proname;
