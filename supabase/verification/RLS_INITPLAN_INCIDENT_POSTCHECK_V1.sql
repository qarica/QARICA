-- RLS_INITPLAN_INCIDENT_POSTCHECK_V1
with expected(tablename,policyname) as (
  values
    ('incidents','incident_select_authorized'),
    ('incident_investigations','incident_investigations_select_authorized'),
    ('incident_contributing_factors','incident_factors_select_authorized'),
    ('rca_analyses','rca_analyses_select_authorized'),
    ('rca_timeline_events','rca_timeline_select_authorized'),
    ('rca_five_whys','rca_five_whys_select_authorized'),
    ('rca_fishbone_factors','rca_fishbone_select_authorized'),
    ('rca_root_causes','rca_root_causes_select_authorized'),
    ('rca_root_cause_action_links','rca_root_action_links_select_authorized')
),
state as (
  select e.tablename,e.policyname,p.qual
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
  )=9 then 'PASS' else 'FAIL' end as auth_uid_initplan_wrapped
from state;
