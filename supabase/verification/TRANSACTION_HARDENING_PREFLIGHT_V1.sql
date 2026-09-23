-- QARICA Transaction Hardening Preflight V1
-- Run BEFORE transaction hardening migrations.
-- Read-only: raises on blockers and ends with ROLLBACK.

begin;

-- Core tables expected by the migration package.
do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'records','record_links','record_status_history','audit_logs','notifications','profiles','departments',
    'roles','permissions','role_permissions','user_roles','user_scopes','user_permissions',
    'findings','finding_verifications','finding_action_links','capas','capa_action_links','evidence','evidence_links','actions',
    'external_assessment_events','inspection_events','inspection_action_links',
    'improvement_proposals','improvement_projects','project_closure_reviews','reporting_obligations','report_submissions',
    'audits','audit_finding_links','incident_investigations','incidents',
    'risks','risk_assessments','risk_acceptances','risk_action_links','fmea_studies','fmea_process_steps','fmea_failure_modes',
    'external_directives','directive_action_links','work_programs','program_action_links',
    'monitoring_rounds','checklist_items','checklist_responses','response_corrections'
  ] loop
    if to_regclass('public.'||v_name) is null then
      raise exception 'Missing required table: %',v_name;
    end if;
  end loop;
end $$;

-- Existing infrastructure RPC required by several transaction functions.
do $$
begin
  if to_regprocedure('public.next_record_code(uuid,text,integer)') is null then
    raise exception 'next_record_code(organization_id, record_type, work_year) function not found; schema lineage is incomplete';
  end if;
end $$;

-- Duplicate blockers for unique constraints.
do $$
begin
  if exists (
    select 1 from record_links
    where relation_type='ESCALATED_TO_CAPA'
    group by source_record_id having count(*)>1
  ) then raise exception 'BLOCKER: duplicate Finding -> CAPA links'; end if;

  if exists (
    select 1 from record_links
    where relation_type='GENERATED_FINDING' and metadata ? 'criterion_ref'
    group by source_record_id,lower(metadata->>'criterion_ref') having count(*)>1
  ) then raise exception 'BLOCKER: duplicate External Assessment criterion Findings'; end if;

  if exists (
    select 1 from inspection_action_links
    where offset_days is not null
    group by inspection_event_id,offset_days having count(*)>1
  ) then raise exception 'BLOCKER: duplicate Inspection countdown offsets'; end if;

  if exists (
    select 1 from record_links
    where relation_type='CONVERTED_TO_PROJECT'
    group by source_record_id having count(*)>1
  ) then raise exception 'BLOCKER: duplicate Improvement Proposal -> Project links'; end if;

  if exists (
    select 1 from report_submissions
    group by reporting_obligation_id,submission_version having count(*)>1
  ) then raise exception 'BLOCKER: duplicate Report submission versions'; end if;

  if exists (
    select 1 from incident_investigations
    where status='IN_PROGRESS'
    group by incident_id having count(*)>1
  ) then raise exception 'BLOCKER: multiple active investigations for an Incident'; end if;
end $$;

-- Referential sanity checks for canonical links used by transaction workflows.
do $$
begin
  if exists (
    select 1 from record_links l
    left join records s on s.id=l.source_record_id
    left join records t on t.id=l.target_record_id
    where l.relation_type in ('ESCALATED_TO_CAPA','GENERATED_FINDING','CONVERTED_TO_PROJECT','HAS_ACTION')
      and (s.id is null or t.id is null)
  ) then raise exception 'BLOCKER: orphan canonical record_link detected'; end if;

  if exists (
    select 1 from actions a
    left join records r on r.id=a.record_id
    where r.id is null or r.record_type<>'ACTION'
  ) then raise exception 'BLOCKER: Action without valid ACTION Registry record detected'; end if;

  if exists (
    select 1 from program_action_links pal
    left join work_programs p on p.id=pal.program_id
    left join actions a on a.id=pal.action_id
    where p.id is null or a.id is null
  ) then raise exception 'BLOCKER: orphan program_action_link detected'; end if;

  if exists (
    select 1 from user_roles ur
    left join profiles p on p.user_id=ur.user_id
    left join roles r on r.id=ur.role_id
    where p.user_id is null or r.id is null
  ) then raise exception 'BLOCKER: orphan user_role detected'; end if;

  if exists (
    select 1 from user_scopes us
    left join profiles p on p.user_id=us.user_id
    left join departments d on d.id=us.department_id
    where p.user_id is null or (us.department_id is not null and d.id is null)
  ) then raise exception 'BLOCKER: orphan user_scope detected'; end if;
end $$;

select
  'TRANSACTION_HARDENING_PREFLIGHT_PASS' as result,
  now() as checked_at,
  current_database() as database_name;

rollback;
