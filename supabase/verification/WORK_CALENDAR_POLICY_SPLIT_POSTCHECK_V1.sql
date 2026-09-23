-- WORK_CALENDAR_POLICY_SPLIT_POSTCHECK_V1
select
  case when count(*) filter (where cmd='SELECT')=1 then 'PASS' else 'FAIL' end as single_select_policy,
  case when count(*) filter (where cmd='INSERT')=1 then 'PASS' else 'FAIL' end as insert_policy,
  case when count(*) filter (where cmd='UPDATE')=1 then 'PASS' else 'FAIL' end as update_policy,
  case when count(*) filter (where cmd='DELETE')=1 then 'PASS' else 'FAIL' end as delete_policy,
  case when count(*) filter (
    where cmd in ('INSERT','UPDATE','DELETE')
      and coalesce(qual,with_check,'') not like '%system.manage%'
  )=0 then 'PASS' else 'FAIL' end as manage_permission_preserved
from pg_policies
where schemaname='public' and tablename='work_calendar_holidays';
