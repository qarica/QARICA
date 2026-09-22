-- Restrict sensitive incident/RCA reads to users with incident.view_case.
-- Organization membership is derived from the parent INCIDENT record.
do $$
declare t text;
begin
  foreach t in array array[
    'incidents','incident_investigations','incident_contributing_factors',
    'rca_analyses','rca_timeline_events','rca_five_whys',
    'rca_fishbone_factors','rca_root_causes','rca_root_cause_action_links'
  ] loop
    execute format('drop policy if exists qlcl_authenticated_select on public.%I',t);
  end loop;
end $$;

create policy incident_select_authorized on public.incidents for select to authenticated
using (
  public.has_permission('incident.view_case')
  and exists (
    select 1 from public.records r
    join public.profiles p on p.user_id=auth.uid() and p.is_active
    where r.id=incidents.record_id and r.organization_id=p.organization_id
  )
);

create policy incident_investigations_select_authorized on public.incident_investigations for select to authenticated
using (
  public.has_permission('incident.view_case') and exists (
    select 1 from public.incidents i join public.records r on r.id=i.record_id
    join public.profiles p on p.user_id=auth.uid() and p.is_active
    where i.id=incident_investigations.incident_id and r.organization_id=p.organization_id
  )
);
create policy incident_factors_select_authorized on public.incident_contributing_factors for select to authenticated
using (
  public.has_permission('incident.view_case') and exists (
    select 1 from public.incidents i join public.records r on r.id=i.record_id
    join public.profiles p on p.user_id=auth.uid() and p.is_active
    where i.id=incident_contributing_factors.incident_id and r.organization_id=p.organization_id
  )
);
create policy rca_analyses_select_authorized on public.rca_analyses for select to authenticated
using (
  public.has_permission('incident.view_case') and exists (
    select 1 from public.incidents i join public.records r on r.id=i.record_id
    join public.profiles p on p.user_id=auth.uid() and p.is_active
    where i.id=rca_analyses.incident_id and r.organization_id=p.organization_id
  )
);
create policy rca_timeline_select_authorized on public.rca_timeline_events for select to authenticated
using (
 public.has_permission('incident.view_case') and exists (
  select 1 from public.rca_analyses a join public.incidents i on i.id=a.incident_id join public.records r on r.id=i.record_id
  join public.profiles p on p.user_id=auth.uid() and p.is_active
  where a.id=rca_timeline_events.rca_analysis_id and r.organization_id=p.organization_id
 )
);
create policy rca_five_whys_select_authorized on public.rca_five_whys for select to authenticated
using (
 public.has_permission('incident.view_case') and exists (
  select 1 from public.rca_analyses a join public.incidents i on i.id=a.incident_id join public.records r on r.id=i.record_id
  join public.profiles p on p.user_id=auth.uid() and p.is_active
  where a.id=rca_five_whys.rca_analysis_id and r.organization_id=p.organization_id
 )
);
create policy rca_fishbone_select_authorized on public.rca_fishbone_factors for select to authenticated
using (
 public.has_permission('incident.view_case') and exists (
  select 1 from public.rca_analyses a join public.incidents i on i.id=a.incident_id join public.records r on r.id=i.record_id
  join public.profiles p on p.user_id=auth.uid() and p.is_active
  where a.id=rca_fishbone_factors.rca_analysis_id and r.organization_id=p.organization_id
 )
);
create policy rca_root_causes_select_authorized on public.rca_root_causes for select to authenticated
using (
 public.has_permission('incident.view_case') and exists (
  select 1 from public.rca_analyses a join public.incidents i on i.id=a.incident_id join public.records r on r.id=i.record_id
  join public.profiles p on p.user_id=auth.uid() and p.is_active
  where a.id=rca_root_causes.rca_analysis_id and r.organization_id=p.organization_id
 )
);
create policy rca_root_action_links_select_authorized on public.rca_root_cause_action_links for select to authenticated
using (
 public.has_permission('incident.view_case') and exists (
  select 1 from public.rca_root_causes rc join public.rca_analyses a on a.id=rc.rca_analysis_id
  join public.incidents i on i.id=a.incident_id join public.records r on r.id=i.record_id
  join public.profiles p on p.user_id=auth.uid() and p.is_active
  where rc.id=rca_root_cause_action_links.root_cause_id and r.organization_id=p.organization_id
 )
);
