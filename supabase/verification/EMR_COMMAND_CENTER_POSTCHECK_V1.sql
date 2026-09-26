-- QARICA EMR Command Center post-deploy verification (read-only)
-- Expected: all assertions return true / zero violations.

-- 1) Canonical table is tenant scoped and RLS enabled.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relname='emr_rollout_items';

-- 2) Canonical table has the program-control columns required by the Command Center.
select column_name
from information_schema.columns
where table_schema='public' and table_name='emr_rollout_items'
  and column_name in ('organization_id','department_id','owner_user_id','due_date','priority','is_go_live_gate','evidence_url','verified_at','verified_by')
order by column_name;

-- 3) Verify EMR permissions exist and are active.
select code,is_active from public.permissions
where code in ('emr.view','emr.manage')
order by code;

-- 4) Legacy prototype tables must have RLS enabled and no policies exposed to authenticated users.
select c.relname as legacy_table, c.relrowsecurity as rls_enabled,
       count(p.policyname) as policy_count
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
left join pg_policies p on p.schemaname=n.nspname and p.tablename=c.relname
where n.nspname='public' and c.relname in (
 'emr_departments','emr_forms','emr_form_department_status','emr_form_issues',
 'emr_processes','emr_it_equipment','emr_medical_equipment','emr_digital_signatures','emr_training_signoff'
)
group by c.relname,c.relrowsecurity order by c.relname;

-- 5) Data-integrity checks. Every count should be 0.
select 'missing_organization' as check_name, count(*) as violations from public.emr_rollout_items where organization_id is null
union all
select 'invalid_priority', count(*) from public.emr_rollout_items where priority not in ('LOW','MEDIUM','HIGH','CRITICAL')
union all
select 'verified_without_done', count(*) from public.emr_rollout_items where verified_at is not null and status <> 'DONE'
union all
select 'verified_without_evidence', count(*) from public.emr_rollout_items where verified_at is not null and nullif(trim(evidence_url),'') is null;
