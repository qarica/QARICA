-- Multi-tenant read boundary, batch 5: workflow child/link tables.
-- Link rows with two business endpoints require both endpoints to belong to the active tenant.

drop policy if exists qlcl_authenticated_select on public.audit_scopes;
create policy qlcl_authenticated_select on public.audit_scopes for select to authenticated
using (
  exists (
    select 1 from public.audits a join public.records r on r.id=a.record_id
    where a.id=audit_scopes.audit_id and r.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.audit_sessions;
create policy qlcl_authenticated_select on public.audit_sessions for select to authenticated
using (
  exists (
    select 1 from public.audits a join public.records r on r.id=a.record_id
    where a.id=audit_sessions.audit_id and r.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.audit_finding_links;
create policy qlcl_authenticated_select on public.audit_finding_links for select to authenticated
using (
  exists (
    select 1
    from public.audits a join public.records ar on ar.id=a.record_id
    join public.findings f on f.id=audit_finding_links.finding_id
    join public.records fr on fr.id=f.record_id
    where a.id=audit_finding_links.audit_id
      and ar.organization_id=private.current_organization_id()
      and fr.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.capa_action_links;
create policy qlcl_authenticated_select on public.capa_action_links for select to authenticated
using (
  exists (
    select 1
    from public.capas c join public.records cr on cr.id=c.record_id
    join public.actions a on a.id=capa_action_links.action_id
    join public.records ar on ar.id=a.record_id
    where c.id=capa_action_links.capa_id
      and cr.organization_id=private.current_organization_id()
      and ar.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.capa_effectiveness_reviews;
create policy qlcl_authenticated_select on public.capa_effectiveness_reviews for select to authenticated
using (
  exists (
    select 1 from public.capas c join public.records r on r.id=c.record_id
    where c.id=capa_effectiveness_reviews.capa_id and r.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.directive_action_links;
create policy qlcl_authenticated_select on public.directive_action_links for select to authenticated
using (
  exists (
    select 1
    from public.external_directives d join public.records dr on dr.id=d.record_id
    join public.actions a on a.id=directive_action_links.action_id
    join public.records ar on ar.id=a.record_id
    where d.id=directive_action_links.directive_id
      and dr.organization_id=private.current_organization_id()
      and ar.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.finding_action_links;
create policy qlcl_authenticated_select on public.finding_action_links for select to authenticated
using (
  exists (
    select 1
    from public.findings f join public.records fr on fr.id=f.record_id
    join public.actions a on a.id=finding_action_links.action_id
    join public.records ar on ar.id=a.record_id
    where f.id=finding_action_links.finding_id
      and fr.organization_id=private.current_organization_id()
      and ar.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.finding_verifications;
create policy qlcl_authenticated_select on public.finding_verifications for select to authenticated
using (
  exists (
    select 1 from public.findings f join public.records r on r.id=f.record_id
    where f.id=finding_verifications.finding_id and r.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.inspection_action_links;
create policy qlcl_authenticated_select on public.inspection_action_links for select to authenticated
using (
  exists (
    select 1
    from public.inspection_events i join public.records ir on ir.id=i.record_id
    join public.actions a on a.id=inspection_action_links.action_id
    join public.records ar on ar.id=a.record_id
    where i.id=inspection_action_links.inspection_event_id
      and ir.organization_id=private.current_organization_id()
      and ar.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.project_objectives;
create policy qlcl_authenticated_select on public.project_objectives for select to authenticated
using (
  exists (
    select 1 from public.improvement_projects p join public.records r on r.id=p.record_id
    where p.id=project_objectives.project_id and r.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.project_milestones;
create policy qlcl_authenticated_select on public.project_milestones for select to authenticated
using (
  exists (
    select 1 from public.improvement_projects p join public.records r on r.id=p.record_id
    where p.id=project_milestones.project_id and r.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.project_closure_reviews;
create policy qlcl_authenticated_select on public.project_closure_reviews for select to authenticated
using (
  exists (
    select 1 from public.improvement_projects p join public.records r on r.id=p.record_id
    where p.id=project_closure_reviews.project_id and r.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.report_submissions;
create policy qlcl_authenticated_select on public.report_submissions for select to authenticated
using (
  exists (
    select 1 from public.reporting_obligations ro join public.records r on r.id=ro.record_id
    where ro.id=report_submissions.reporting_obligation_id and r.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.risk_assessments;
create policy qlcl_authenticated_select on public.risk_assessments for select to authenticated
using (
  exists (
    select 1 from public.risks rk join public.records r on r.id=rk.record_id
    where rk.id=risk_assessments.risk_id and r.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.risk_acceptances;
create policy qlcl_authenticated_select on public.risk_acceptances for select to authenticated
using (
  exists (
    select 1 from public.risks rk join public.records r on r.id=rk.record_id
    where rk.id=risk_acceptances.risk_id and r.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.risk_action_links;
create policy qlcl_authenticated_select on public.risk_action_links for select to authenticated
using (
  exists (
    select 1
    from public.risks rk join public.records rr on rr.id=rk.record_id
    join public.actions a on a.id=risk_action_links.action_id
    join public.records ar on ar.id=a.record_id
    where rk.id=risk_action_links.risk_id
      and rr.organization_id=private.current_organization_id()
      and ar.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.fmea_process_steps;
create policy qlcl_authenticated_select on public.fmea_process_steps for select to authenticated
using (
  exists (
    select 1 from public.fmea_studies fs join public.records r on r.id=fs.record_id
    where fs.id=fmea_process_steps.fmea_study_id and r.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.fmea_failure_modes;
create policy qlcl_authenticated_select on public.fmea_failure_modes for select to authenticated
using (
  exists (
    select 1
    from public.fmea_process_steps ps
    join public.fmea_studies fs on fs.id=ps.fmea_study_id
    join public.records r on r.id=fs.record_id
    where ps.id=fmea_failure_modes.process_step_id
      and r.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.incident_reports;
create policy qlcl_authenticated_select on public.incident_reports for select to authenticated
using (
  exists (
    select 1 from public.incidents i join public.records r on r.id=i.record_id
    where i.id=incident_reports.incident_id and r.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.recurring_work_runs;
create policy qlcl_authenticated_select on public.recurring_work_runs for select to authenticated
using (
  exists (
    select 1 from public.recurring_work_templates t
    where t.id=recurring_work_runs.template_id
      and t.organization_id=private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.record_links;
create policy qlcl_authenticated_select on public.record_links for select to authenticated
using (
  exists (
    select 1
    from public.records sr
    join public.records tr on tr.id=record_links.target_record_id
    where sr.id=record_links.source_record_id
      and sr.organization_id=private.current_organization_id()
      and tr.organization_id=private.current_organization_id()
  )
);

revoke select on
  public.audit_scopes,
  public.audit_sessions,
  public.audit_finding_links,
  public.capa_action_links,
  public.capa_effectiveness_reviews,
  public.directive_action_links,
  public.finding_action_links,
  public.finding_verifications,
  public.inspection_action_links,
  public.project_objectives,
  public.project_milestones,
  public.project_closure_reviews,
  public.report_submissions,
  public.risk_assessments,
  public.risk_acceptances,
  public.risk_action_links,
  public.fmea_process_steps,
  public.fmea_failure_modes,
  public.incident_reports,
  public.recurring_work_runs,
  public.record_links
from anon;
