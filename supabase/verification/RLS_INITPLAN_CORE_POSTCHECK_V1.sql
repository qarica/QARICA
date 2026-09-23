-- RLS_INITPLAN_CORE_POSTCHECK_V1
with expected(tablename,policyname) as (
  values
    ('work_groups','work_groups_select_same_org'),
    ('work_group_members','work_group_members_select_same_org'),
    ('work_group_assignment_snapshots','work_group_assignment_snapshots_select_same_org'),
    ('notifications','qlcl_authenticated_update_own'),
    ('notifications','qlcl_authenticated_select_own'),
    ('work_calendar_holidays','work_calendar_holidays_select_org'),
    ('work_calendar_holidays','work_calendar_holidays_manage_system'),
    ('indicator_source_aliases','indicator_source_aliases_select_authenticated'),
    ('quality_traceability_links','qlcl_traceability_org_select')
),
state as (
  select e.tablename,e.policyname,p.qual,p.with_check
  from expected e
  left join pg_policies p
    on p.schemaname='public'
   and p.tablename=e.tablename
   and p.policyname=e.policyname
)
select
  case when count(*)=9 then 'PASS' else 'FAIL' end as policy_count,
  case when count(*) filter (
    where qual is not null and lower(qual) like '%select auth.uid()%'
  )=9 then 'PASS' else 'FAIL' end as using_initplan_wrapped,
  case when count(*) filter (
    where with_check is not null and lower(with_check) not like '%select auth.uid()%'
  )=0 then 'PASS' else 'FAIL' end as with_check_initplan_wrapped
from state;
