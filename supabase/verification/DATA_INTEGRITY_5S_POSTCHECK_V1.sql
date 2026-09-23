-- DATA_INTEGRITY_5S_POSTCHECK_V1
-- Read-only production integrity checks for QARICA core links and duplicate business keys.
with checks as (
  select 'actions_orphan_record'::text as check_name, count(*)::bigint as n
  from public.actions a left join public.records r on r.id=a.record_id where r.id is null

  union all select 'evidence_links_orphan_record', count(*)
  from public.evidence_links e left join public.records r on r.id=e.record_id
  where e.record_id is not null and r.id is null

  union all select 'evidence_links_orphan_evidence', count(*)
  from public.evidence_links l left join public.evidence e on e.id=l.evidence_id where e.id is null

  union all select 'department_execution_orphan_action', count(*)
  from public.action_department_executions x left join public.actions a on a.id=x.action_id where a.id is null

  union all select 'capa_action_orphan_capa', count(*)
  from public.capa_action_links l left join public.capas c on c.id=l.capa_id where c.id is null

  union all select 'capa_action_orphan_action', count(*)
  from public.capa_action_links l left join public.actions a on a.id=l.action_id where a.id is null

  union all select 'assessment_criteria_orphan_item', count(*)
  from public.assessment_round_criteria arc left join public.criteria_items ci on ci.id=arc.criteria_item_id
  where arc.criteria_item_id is not null and ci.id is null

  union all select 'audit_finding_orphan_audit', count(*)
  from public.audit_finding_links l left join public.audits a on a.id=l.audit_id where a.id is null

  union all select 'audit_finding_orphan_finding', count(*)
  from public.audit_finding_links l left join public.findings f on f.id=l.finding_id where f.id is null

  union all select 'directive_action_orphan_directive', count(*)
  from public.directive_action_links l left join public.external_directives d on d.id=l.directive_id where d.id is null

  union all select 'directive_action_orphan_action', count(*)
  from public.directive_action_links l left join public.actions a on a.id=l.action_id where a.id is null

  union all select 'finding_action_orphan_finding', count(*)
  from public.finding_action_links l left join public.findings f on f.id=l.finding_id where f.id is null

  union all select 'finding_action_orphan_action', count(*)
  from public.finding_action_links l left join public.actions a on a.id=l.action_id where a.id is null

  union all select 'fmea_action_orphan_mode', count(*)
  from public.fmea_failure_mode_action_links l left join public.fmea_failure_modes f on f.id=l.failure_mode_id where f.id is null

  union all select 'fmea_action_orphan_record', count(*)
  from public.fmea_failure_mode_action_links l left join public.records r on r.id=l.action_record_id where r.id is null

  union all select 'inspection_action_orphan_inspection', count(*)
  from public.inspection_action_links l left join public.inspection_events i on i.id=l.inspection_event_id where i.id is null

  union all select 'inspection_action_orphan_action', count(*)
  from public.inspection_action_links l left join public.actions a on a.id=l.action_id where a.id is null

  union all select 'program_action_orphan_program', count(*)
  from public.program_action_links l left join public.work_programs p on p.id=l.program_id where p.id is null

  union all select 'program_action_orphan_action', count(*)
  from public.program_action_links l left join public.actions a on a.id=l.action_id where a.id is null

  union all select 'program_reference_orphan_program', count(*)
  from public.program_reference_links l left join public.work_programs p on p.id=l.program_id where p.id is null

  union all select 'program_reference_orphan_directive', count(*)
  from public.program_reference_links l left join public.external_directives d on d.id=l.directive_id where d.id is null

  union all select 'rca_action_orphan_root_cause', count(*)
  from public.rca_root_cause_action_links l left join public.rca_root_causes r on r.id=l.root_cause_id where r.id is null

  union all select 'rca_action_orphan_action', count(*)
  from public.rca_root_cause_action_links l left join public.actions a on a.id=l.action_id where a.id is null

  union all select 'record_link_orphan_source', count(*)
  from public.record_links l left join public.records r on r.id=l.source_record_id where r.id is null

  union all select 'record_link_orphan_target', count(*)
  from public.record_links l left join public.records r on r.id=l.target_record_id where r.id is null

  union all select 'quality_domain_orphan_record', count(*)
  from public.record_quality_domain_links l left join public.records r on r.id=l.record_id where r.id is null

  union all select 'quality_domain_orphan_domain', count(*)
  from public.record_quality_domain_links l left join public.quality_domains d on d.id=l.domain_id where d.id is null

  union all select 'risk_action_orphan_risk', count(*)
  from public.risk_action_links l left join public.risks r on r.id=l.risk_id where r.id is null

  union all select 'risk_action_orphan_action', count(*)
  from public.risk_action_links l left join public.actions a on a.id=l.action_id where a.id is null

  union all select 'duplicate_record_code_org', count(*) from (
    select organization_id,upper(trim(record_code)),count(*)
    from public.records where nullif(trim(record_code),'') is not null
    group by organization_id,upper(trim(record_code)) having count(*)>1
  ) d

  union all select 'duplicate_indicator_code_org', count(*) from (
    select organization_id,upper(trim(code)),count(*)
    from public.indicator_definitions where nullif(trim(code),'') is not null
    group by organization_id,upper(trim(code)) having count(*)>1
  ) d

  union all select 'duplicate_checklist_code_org', count(*) from (
    select organization_id,upper(trim(code)),count(*)
    from public.checklist_templates where nullif(trim(code),'') is not null
    group by organization_id,upper(trim(code)) having count(*)>1
  ) d

  union all select 'duplicate_notification_event', count(*) from (
    select recipient_user_id,notification_event_key,count(*)
    from public.notifications where notification_event_key is not null
    group by recipient_user_id,notification_event_key having count(*)>1
  ) d

  union all select 'duplicate_record_links', count(*) from (
    select source_record_id,target_record_id,relation_type,count(*)
    from public.record_links group by source_record_id,target_record_id,relation_type having count(*)>1
  ) d

  union all select 'duplicate_finding_action_links', count(*) from (
    select finding_id,action_id,coalesce(action_role,''),count(*)
    from public.finding_action_links group by finding_id,action_id,coalesce(action_role,'') having count(*)>1
  ) d

  union all select 'duplicate_directive_action_links', count(*) from (
    select directive_id,action_id,coalesce(relation_type,''),count(*)
    from public.directive_action_links group by directive_id,action_id,coalesce(relation_type,'') having count(*)>1
  ) d

  union all select 'duplicate_risk_action_links', count(*) from (
    select risk_id,action_id,coalesce(treatment_type,''),count(*)
    from public.risk_action_links group by risk_id,action_id,coalesce(treatment_type,'') having count(*)>1
  ) d

  union all select 'traceability_needs_confirmation', count(*)
  from public.quality_traceability_links where needs_confirmation
)
select check_name,
       case when n=0 then 'PASS' else 'FAIL' end as status,
       n
from checks
order by check_name;
