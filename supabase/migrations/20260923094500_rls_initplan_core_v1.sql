-- QARICA RLS init-plan optimization V1 (core/non-incident).
-- Semantics are unchanged: only auth.uid() calls are wrapped in scalar SELECT
-- so PostgreSQL can initialize them once per statement instead of per row.

do $$
declare
  r record;
  v_count integer := 0;
  v_qual text;
  v_check text;
begin
  select count(*) into v_count
  from pg_policies p
  where p.schemaname='public'
    and (p.tablename,p.policyname) in (
      ('work_groups','work_groups_select_same_org'),
      ('work_group_members','work_group_members_select_same_org'),
      ('work_group_assignment_snapshots','work_group_assignment_snapshots_select_same_org'),
      ('notifications','qlcl_authenticated_update_own'),
      ('notifications','qlcl_authenticated_select_own'),
      ('work_calendar_holidays','work_calendar_holidays_select_org'),
      ('work_calendar_holidays','work_calendar_holidays_manage_system'),
      ('indicator_source_aliases','indicator_source_aliases_select_authenticated'),
      ('quality_traceability_links','qlcl_traceability_org_select')
    );

  if v_count <> 9 then
    raise exception 'Expected 9 core RLS policies, found %', v_count;
  end if;

  for r in
    select p.tablename,p.policyname,p.qual,p.with_check
    from pg_policies p
    where p.schemaname='public'
      and (p.tablename,p.policyname) in (
        ('work_groups','work_groups_select_same_org'),
        ('work_group_members','work_group_members_select_same_org'),
        ('work_group_assignment_snapshots','work_group_assignment_snapshots_select_same_org'),
        ('notifications','qlcl_authenticated_update_own'),
        ('notifications','qlcl_authenticated_select_own'),
        ('work_calendar_holidays','work_calendar_holidays_select_org'),
        ('work_calendar_holidays','work_calendar_holidays_manage_system'),
        ('indicator_source_aliases','indicator_source_aliases_select_authenticated'),
        ('quality_traceability_links','qlcl_traceability_org_select')
      )
  loop
    v_qual := replace(r.qual,'auth.uid()','(select auth.uid())');
    v_check := case when r.with_check is null then null
                    else replace(r.with_check,'auth.uid()','(select auth.uid())') end;

    execute format(
      'alter policy %I on public.%I using (%s)%s',
      r.policyname,
      r.tablename,
      v_qual,
      case when v_check is null then ''
           else format(' with check (%s)',v_check) end
    );
  end loop;
end $$;
