-- Multi-tenant read boundary, batch 2: record-backed domain tables.
-- Applies only where record_id is NOT NULL. Nullable audit/evidence link tables are
-- intentionally deferred to a dedicated policy so valid non-record contexts are preserved.

create or replace function private.record_in_current_organization(p_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.records r
    where r.id = p_record_id
      and r.organization_id = private.current_organization_id()
  )
$function$;

revoke all on function private.record_in_current_organization(uuid) from public, anon;
grant execute on function private.record_in_current_organization(uuid) to authenticated, service_role;

drop policy if exists qlcl_authenticated_select on public.assessment_rounds;
create policy qlcl_authenticated_select
on public.assessment_rounds for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.audits;
create policy qlcl_authenticated_select
on public.audits for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.capas;
create policy qlcl_authenticated_select
on public.capas for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.external_assessment_events;
create policy qlcl_authenticated_select
on public.external_assessment_events for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.external_directives;
create policy qlcl_authenticated_select
on public.external_directives for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.feedback_records;
create policy qlcl_authenticated_select
on public.feedback_records for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.findings;
create policy qlcl_authenticated_select
on public.findings for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.fmea_studies;
create policy qlcl_authenticated_select
on public.fmea_studies for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.improvement_projects;
create policy qlcl_authenticated_select
on public.improvement_projects for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.improvement_proposals;
create policy qlcl_authenticated_select
on public.improvement_proposals for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.indicator_measurements;
create policy qlcl_authenticated_select
on public.indicator_measurements for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.inspection_events;
create policy qlcl_authenticated_select
on public.inspection_events for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.monitoring_rounds;
create policy qlcl_authenticated_select
on public.monitoring_rounds for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.record_comments;
create policy qlcl_authenticated_select
on public.record_comments for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.record_status_history;
create policy qlcl_authenticated_select
on public.record_status_history for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.reporting_obligations;
create policy qlcl_authenticated_select
on public.reporting_obligations for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.risks;
create policy qlcl_authenticated_select
on public.risks for select to authenticated
using (private.record_in_current_organization(record_id));

drop policy if exists qlcl_authenticated_select on public.safety_alerts;
create policy qlcl_authenticated_select
on public.safety_alerts for select to authenticated
using (private.record_in_current_organization(record_id));

revoke select on public.assessment_rounds,
  public.audits,
  public.capas,
  public.external_assessment_events,
  public.external_directives,
  public.feedback_records,
  public.findings,
  public.fmea_studies,
  public.improvement_projects,
  public.improvement_proposals,
  public.indicator_measurements,
  public.inspection_events,
  public.monitoring_rounds,
  public.record_comments,
  public.record_status_history,
  public.reporting_obligations,
  public.risks,
  public.safety_alerts from anon;
