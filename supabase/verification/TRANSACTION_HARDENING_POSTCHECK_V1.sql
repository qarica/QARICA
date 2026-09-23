-- QARICA Transaction Hardening Postcheck V1
-- Run manually in Supabase SQL Editor AFTER all transaction migrations.
-- Read-only except for raising exceptions; does not mutate business data.

begin;

-- Required RPCs must exist with the expected signatures.
do $$
begin
  if to_regprocedure('public.qlcl_escalate_finding_to_capa_v1(uuid,uuid,text,text)') is null then raise exception 'Missing qlcl_escalate_finding_to_capa_v1'; end if;
  if to_regprocedure('public.qlcl_external_assessment_create_gap_finding_v1(uuid,uuid,text,text,text,text,text,date)') is null then raise exception 'Missing qlcl_external_assessment_create_gap_finding_v1'; end if;
  if to_regprocedure('public.qlcl_generate_inspection_countdown_v1(uuid,uuid,uuid,uuid)') is null then raise exception 'Missing qlcl_generate_inspection_countdown_v1'; end if;
  if to_regprocedure('public.qlcl_accept_and_close_finding_v1(uuid,uuid,text)') is null then raise exception 'Missing qlcl_accept_and_close_finding_v1'; end if;
  if to_regprocedure('public.qlcl_close_capa_v1(uuid,uuid,text)') is null then raise exception 'Missing qlcl_close_capa_v1'; end if;
  if to_regprocedure('public.qlcl_close_inspection_v1(uuid,uuid,text)') is null then raise exception 'Missing qlcl_close_inspection_v1'; end if;
  if to_regprocedure('public.qlcl_approve_proposal_create_project_v1(uuid,uuid,date,date,text)') is null then raise exception 'Missing qlcl_approve_proposal_create_project_v1'; end if;
  if to_regprocedure('public.qlcl_close_audit_v1(uuid,uuid,text)') is null then raise exception 'Missing qlcl_close_audit_v1'; end if;
  if to_regprocedure('public.qlcl_submit_report_v1(uuid,uuid,text,text,text)') is null then raise exception 'Missing qlcl_submit_report_v1'; end if;
  if to_regprocedure('public.qlcl_confirm_report_received_v1(uuid,uuid,text)') is null then raise exception 'Missing qlcl_confirm_report_received_v1'; end if;
  if to_regprocedure('public.qlcl_start_incident_investigation_v1(uuid,uuid,text)') is null then raise exception 'Missing qlcl_start_incident_investigation_v1'; end if;
  if to_regprocedure('public.qlcl_complete_incident_investigation_v1(uuid,uuid,text,text,text,text)') is null then raise exception 'Missing qlcl_complete_incident_investigation_v1'; end if;
  if to_regprocedure('public.qlcl_close_incident_v1(uuid,uuid,text)') is null then raise exception 'Missing qlcl_close_incident_v1'; end if;
  if to_regprocedure('public.qlcl_accept_risk_v1(uuid,uuid,text,text,date)') is null then raise exception 'Missing qlcl_accept_risk_v1'; end if;
  if to_regprocedure('public.qlcl_retire_risk_v1(uuid,uuid,text)') is null then raise exception 'Missing qlcl_retire_risk_v1'; end if;
  if to_regprocedure('public.qlcl_close_fmea_v1(uuid,uuid,text)') is null then raise exception 'Missing qlcl_close_fmea_v1'; end if;
  if to_regprocedure('public.qlcl_complete_directive_v1(uuid,uuid,text)') is null then raise exception 'Missing qlcl_complete_directive_v1'; end if;
  if to_regprocedure('public.qlcl_close_improvement_project_v1(uuid,uuid,text)') is null then raise exception 'Missing qlcl_close_improvement_project_v1'; end if;
  if to_regprocedure('public.qlcl_monitoring_save_initial_results_v1(uuid,uuid,text,timestamptz,timestamptz,jsonb)') is null then raise exception 'Missing qlcl_monitoring_save_initial_results_v1'; end if;
  if to_regprocedure('public.qlcl_monitoring_apply_recheck_v1(uuid,uuid,timestamptz,jsonb)') is null then raise exception 'Missing qlcl_monitoring_apply_recheck_v1'; end if;
  if to_regprocedure('public.qlcl_monitoring_confirm_v1(uuid,uuid,text,timestamptz)') is null then raise exception 'Missing qlcl_monitoring_confirm_v1'; end if;
  if to_regprocedure('public.qlcl_change_record_lifecycle_v1(uuid,uuid,text,text)') is null then raise exception 'Missing qlcl_change_record_lifecycle_v1'; end if;
  if to_regprocedure('public.qlcl_create_linked_action_v1(uuid,uuid,jsonb)') is null then raise exception 'Missing qlcl_create_linked_action_v1'; end if;
  if to_regprocedure('public.qlcl_create_plan_action_v1(uuid,uuid,jsonb)') is null then raise exception 'Missing qlcl_create_plan_action_v1'; end if;
  if to_regprocedure('public.qlcl_set_user_access_v1(uuid,uuid,jsonb)') is null then raise exception 'Missing qlcl_set_user_access_v1'; end if;
end $$;

-- Unique indexes must exist.
do $$
begin
  if to_regclass('public.uq_record_links_one_capa_per_finding') is null then raise exception 'Missing uq_record_links_one_capa_per_finding'; end if;
  if to_regclass('public.uq_record_links_external_gap_criterion') is null then raise exception 'Missing uq_record_links_external_gap_criterion'; end if;
  if to_regclass('public.uq_inspection_action_offset') is null then raise exception 'Missing uq_inspection_action_offset'; end if;
  if to_regclass('public.uq_record_links_one_project_per_proposal') is null then raise exception 'Missing uq_record_links_one_project_per_proposal'; end if;
  if not exists (
    select 1
    from pg_index i
    join pg_class t on t.oid=i.indrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public'
      and t.relname='report_submissions'
      and i.indisunique
      and (
        select array_agg(a.attname order by keypos.ordinality)
        from unnest(i.indkey) with ordinality as keypos(attnum, ordinality)
        join pg_attribute a on a.attrelid=t.oid and a.attnum=keypos.attnum
      ) = array['reporting_obligation_id','submission_version']::name[]
  ) then raise exception 'Missing unique key on report_submissions(reporting_obligation_id, submission_version)'; end if;
  if to_regclass('public.uq_incident_one_active_investigation') is null then raise exception 'Missing uq_incident_one_active_investigation'; end if;
end $$;

-- Historical duplicate checks should remain clean after migration.
do $$
begin
  if exists (select 1 from record_links where relation_type='ESCALATED_TO_CAPA' group by source_record_id having count(*)>1) then raise exception 'Duplicate Finding -> CAPA links detected'; end if;
  if exists (select 1 from record_links where relation_type='GENERATED_FINDING' and metadata ? 'criterion_ref' group by source_record_id,lower(metadata->>'criterion_ref') having count(*)>1) then raise exception 'Duplicate External Assessment criterion Findings detected'; end if;
  if exists (select 1 from inspection_action_links where offset_days is not null group by inspection_event_id,offset_days having count(*)>1) then raise exception 'Duplicate Inspection countdown offsets detected'; end if;
  if exists (select 1 from record_links where relation_type='CONVERTED_TO_PROJECT' group by source_record_id having count(*)>1) then raise exception 'Duplicate Improvement Proposal -> Project links detected'; end if;
  if exists (select 1 from report_submissions group by reporting_obligation_id,submission_version having count(*)>1) then raise exception 'Duplicate report submission versions detected'; end if;
  if exists (select 1 from incident_investigations where status='IN_PROGRESS' group by incident_id having count(*)>1) then raise exception 'Multiple active investigations detected for an Incident'; end if;
end $$;

-- Security surface: business users must not execute SECURITY DEFINER mutation RPCs directly.
do $$
declare
  v_oid oid;
  v_count integer:=0;
begin
  for v_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'qlcl_escalate_finding_to_capa_v1',
        'qlcl_external_assessment_create_gap_finding_v1',
        'qlcl_generate_inspection_countdown_v1',
        'qlcl_accept_and_close_finding_v1',
        'qlcl_close_capa_v1',
        'qlcl_close_inspection_v1',
        'qlcl_approve_proposal_create_project_v1',
        'qlcl_close_audit_v1',
        'qlcl_submit_report_v1',
        'qlcl_confirm_report_received_v1',
        'qlcl_start_incident_investigation_v1',
        'qlcl_complete_incident_investigation_v1',
        'qlcl_close_incident_v1',
        'qlcl_accept_risk_v1',
        'qlcl_retire_risk_v1',
        'qlcl_close_fmea_v1',
        'qlcl_complete_directive_v1',
        'qlcl_close_improvement_project_v1',
        'qlcl_monitoring_save_initial_results_v1',
        'qlcl_monitoring_apply_recheck_v1',
        'qlcl_monitoring_confirm_v1',
        'qlcl_change_record_lifecycle_v1',
        'qlcl_create_linked_action_v1',
        'qlcl_create_plan_action_v1',
        'qlcl_set_user_access_v1'
      )
  loop
    v_count:=v_count+1;
    if has_function_privilege('anon',v_oid,'EXECUTE') then raise exception 'anon unexpectedly has EXECUTE on transaction RPC oid %',v_oid; end if;
    if has_function_privilege('authenticated',v_oid,'EXECUTE') then raise exception 'authenticated unexpectedly has EXECUTE on transaction RPC oid %',v_oid; end if;
    if not has_function_privilege('service_role',v_oid,'EXECUTE') then raise exception 'service_role is missing EXECUTE on transaction RPC oid %',v_oid; end if;
  end loop;
  if v_count<>25 then raise exception 'Expected 25 transaction RPCs in security check, found %',v_count; end if;
end $$;

select
  'TRANSACTION_HARDENING_POSTCHECK_PASS' as result,
  25 as verified_rpc_count,
  6 as verified_unique_index_count,
  now() as checked_at,
  current_database() as database_name;

rollback;
