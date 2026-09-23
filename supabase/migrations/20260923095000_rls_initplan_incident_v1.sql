-- QARICA RLS init-plan optimization V1 (Incident/RCA).
-- Authorization semantics are unchanged; only auth.uid() is wrapped in SELECT.

do $$
declare
  r record;
  v_count integer := 0;
  v_qual text;
begin
  select count(*) into v_count
  from pg_policies p
  where p.schemaname='public'
    and (p.tablename,p.policyname) in (
      ('incidents','incident_select_authorized'),
      ('incident_investigations','incident_investigations_select_authorized'),
      ('incident_contributing_factors','incident_factors_select_authorized'),
      ('rca_analyses','rca_analyses_select_authorized'),
      ('rca_timeline_events','rca_timeline_select_authorized'),
      ('rca_five_whys','rca_five_whys_select_authorized'),
      ('rca_fishbone_factors','rca_fishbone_select_authorized'),
      ('rca_root_causes','rca_root_causes_select_authorized'),
      ('rca_root_cause_action_links','rca_root_action_links_select_authorized')
    );

  if v_count <> 9 then
    raise exception 'Expected 9 Incident/RCA RLS policies, found %', v_count;
  end if;

  for r in
    select p.tablename,p.policyname,p.qual
    from pg_policies p
    where p.schemaname='public'
      and (p.tablename,p.policyname) in (
        ('incidents','incident_select_authorized'),
        ('incident_investigations','incident_investigations_select_authorized'),
        ('incident_contributing_factors','incident_factors_select_authorized'),
        ('rca_analyses','rca_analyses_select_authorized'),
        ('rca_timeline_events','rca_timeline_select_authorized'),
        ('rca_five_whys','rca_five_whys_select_authorized'),
        ('rca_fishbone_factors','rca_fishbone_select_authorized'),
        ('rca_root_causes','rca_root_causes_select_authorized'),
        ('rca_root_cause_action_links','rca_root_action_links_select_authorized')
      )
  loop
    v_qual := replace(r.qual,'auth.uid()','(select auth.uid())');
    execute format(
      'alter policy %I on public.%I using (%s)',
      r.policyname,
      r.tablename,
      v_qual
    );
  end loop;
end $$;
