-- QLCL-TTSG Operational Transactions V2
-- Atomic operations for Improvement Proposal -> Project, Audit close, Report submit/complete.
-- Apply only after backup, preflight and preview CI PASS.

begin;

-- Historical duplicate preflight.
do $$
begin
  if exists (
    select 1 from record_links
    where relation_type='CONVERTED_TO_PROJECT'
    group by source_record_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate Improvement Proposal -> Project links exist. Resolve before migration.';
  end if;

  if exists (
    select 1 from report_submissions
    group by reporting_obligation_id, submission_version
    having count(*) > 1
  ) then
    raise exception 'Duplicate report submission versions exist. Resolve before migration.';
  end if;
end $$;

create unique index if not exists uq_record_links_one_project_per_proposal
  on record_links(source_record_id)
  where relation_type='CONVERTED_TO_PROJECT';

create unique index if not exists uq_report_submission_version
  on report_submissions(reporting_obligation_id, submission_version);

create or replace function qlcl_approve_proposal_create_project_v1(
  p_proposal_record_id uuid,
  p_actor_user_id uuid,
  p_start_date date,
  p_target_end_date date,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_source records%rowtype;
  v_proposal improvement_proposals%rowtype;
  v_code text;
  v_project_record_id uuid;
  v_project_id uuid;
  v_reason text;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if p_start_date is null or p_target_end_date is null or p_target_end_date < p_start_date then
    raise exception 'Valid project start and target end dates are required';
  end if;

  select * into v_source from records
  where id=p_proposal_record_id and record_type='IMPROVEMENT_PROPOSAL'
  for update;
  if not found then raise exception 'Improvement proposal record not found'; end if;
  if v_source.lifecycle_status <> 'ACTIVE' then raise exception 'Improvement proposal is not active'; end if;

  select * into v_proposal from improvement_proposals
  where record_id=p_proposal_record_id
  for update;
  if not found then raise exception 'Improvement proposal domain row not found'; end if;
  if v_proposal.workflow_status <> 'SUBMITTED' then raise exception 'Improvement proposal must be SUBMITTED'; end if;
  if coalesce(trim(v_proposal.problem_description),'')='' or coalesce(trim(v_proposal.existing_data_summary),'')='' or coalesce(trim(v_proposal.proposed_scope),'')='' then
    raise exception 'Problem, baseline data and scope are required';
  end if;
  if exists(select 1 from record_links where source_record_id=p_proposal_record_id and relation_type='CONVERTED_TO_PROJECT') then
    raise exception 'Improvement proposal already converted to project';
  end if;

  select next_record_code('IMPROVEMENT_PROJECT',v_source.work_year) into v_code;
  if v_code is null then raise exception 'Could not allocate Improvement Project code'; end if;

  insert into records(
    organization_id,record_type,record_code,title,work_year,
    owner_department_id,owner_user_id,lifecycle_status,created_by
  ) values (
    v_source.organization_id,'IMPROVEMENT_PROJECT',v_code,v_source.title,v_source.work_year,
    v_source.owner_department_id,v_source.owner_user_id,'ACTIVE',p_actor_user_id
  ) returning id into v_project_record_id;

  insert into improvement_projects(
    record_id,work_year,title,problem_statement,lead_department_id,
    project_leader_user_id,start_date,target_end_date,scope_description,workflow_status
  ) values (
    v_project_record_id,v_source.work_year,v_source.title,v_proposal.problem_description,
    v_source.owner_department_id,v_source.owner_user_id,p_start_date,p_target_end_date,
    v_proposal.proposed_scope,'DRAFT'
  ) returning id into v_project_id;

  insert into record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
  values(
    p_proposal_record_id,v_project_record_id,'CONVERTED_TO_PROJECT',
    jsonb_build_object('source_record_code',v_source.record_code,'approved_from_proposal',true),
    p_actor_user_id
  );

  update improvement_proposals
  set workflow_status='APPROVED',reviewed_at=now(),updated_at=now()
  where id=v_proposal.id;

  v_reason:=coalesce(nullif(trim(p_reason),''),'Đề xuất đủ căn cứ và được chuyển thành đề án cải tiến.');

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_proposal_record_id,'improvement_proposals',v_proposal.id,
    'IMPROVEMENT_PROPOSAL_APPROVE_AND_CREATE_PROJECT',
    jsonb_build_object('workflow_status',v_proposal.workflow_status),
    jsonb_build_object('workflow_status','APPROVED','project_record_id',v_project_record_id,'project_id',v_project_id),
    v_reason,jsonb_build_object('source','qlcl-ui','transaction','qlcl_approve_proposal_create_project_v1')
  );

  return jsonb_build_object('ok',true,'status','APPROVED','project_record_id',v_project_record_id,'project_id',v_project_id,'project_code',v_code);
end;
$$;

create or replace function qlcl_close_audit_v1(
  p_audit_record_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_record records%rowtype;
  v_audit audits%rowtype;
  v_open integer;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Audit close conclusion is required'; end if;

  select * into v_record from records
  where id=p_audit_record_id and record_type='AUDIT'
  for update;
  if not found then raise exception 'Audit record not found'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'Audit record is not active'; end if;

  select * into v_audit from audits
  where record_id=p_audit_record_id
  for update;
  if not found then raise exception 'Audit domain row not found'; end if;
  if v_audit.workflow_status <> 'FOLLOW_UP' then raise exception 'Audit must be FOLLOW_UP before close'; end if;

  select count(*) into v_open
  from audit_finding_links l
  join findings f on f.id=l.finding_id
  where l.audit_id=v_audit.id
    and coalesce(f.workflow_status,'') not in ('CLOSED','CANCELLED');
  if v_open > 0 then raise exception 'Audit has % open Finding(s)',v_open; end if;

  update audits set workflow_status='CLOSED',closed_at=now(),updated_at=now() where id=v_audit.id;
  update records set lifecycle_status='CLOSED',closed_at=now(),updated_at=now() where id=p_audit_record_id;
  insert into record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_audit_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,trim(p_reason));

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_audit_record_id,'audits',v_audit.id,'AUDIT_CLOSE',
    jsonb_build_object('workflow_status',v_audit.workflow_status),jsonb_build_object('workflow_status','CLOSED'),
    trim(p_reason),jsonb_build_object('source','qlcl-ui','transaction','qlcl_close_audit_v1')
  );

  return jsonb_build_object('ok',true,'status','CLOSED');
end;
$$;

create or replace function qlcl_submit_report_v1(
  p_report_record_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_channel text default null,
  p_official_document_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_record records%rowtype;
  v_report reporting_obligations%rowtype;
  v_version integer;
  v_channel text;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Review conclusion is required before report submission'; end if;

  select * into v_record from records
  where id=p_report_record_id and record_type='REPORT'
  for update;
  if not found then raise exception 'Report record not found'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'Report record is not active'; end if;

  select * into v_report from reporting_obligations
  where record_id=p_report_record_id
  for update;
  if not found then raise exception 'Reporting obligation not found'; end if;
  if v_report.workflow_status <> 'REVIEWING' then raise exception 'Report must be REVIEWING before submit'; end if;
  if coalesce(trim(v_report.recipient_name),'')='' then raise exception 'Report recipient is required'; end if;
  if not exists(select 1 from evidence_links where record_id=p_report_record_id) then raise exception 'Final report evidence is required'; end if;

  select coalesce(max(submission_version),0)+1 into v_version
  from report_submissions
  where reporting_obligation_id=v_report.id;
  v_channel:=coalesce(nullif(trim(p_channel),''),nullif(trim(v_report.submission_method),''),'OTHER');

  insert into report_submissions(
    reporting_obligation_id,submission_version,submission_type,submitted_at,
    recipient,channel,official_document_number
  ) values (
    v_report.id,v_version,case when v_version=1 then 'INITIAL' else 'RESUBMISSION' end,now(),
    v_report.recipient_name,v_channel,nullif(trim(p_official_document_number),'')
  );

  update reporting_obligations set workflow_status='SUBMITTED',updated_at=now() where id=v_report.id;

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_report_record_id,'reporting_obligations',v_report.id,'REPORT_SUBMIT',
    jsonb_build_object('workflow_status',v_report.workflow_status),
    jsonb_build_object('workflow_status','SUBMITTED','submission_version',v_version),
    trim(p_reason),jsonb_build_object('source','qlcl-ui','transaction','qlcl_submit_report_v1')
  );

  return jsonb_build_object('ok',true,'status','SUBMITTED','submission_version',v_version);
end;
$$;

create or replace function qlcl_confirm_report_received_v1(
  p_report_record_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_record records%rowtype;
  v_report reporting_obligations%rowtype;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Receipt confirmation is required'; end if;

  select * into v_record from records
  where id=p_report_record_id and record_type='REPORT'
  for update;
  if not found then raise exception 'Report record not found'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'Report record is not active'; end if;

  select * into v_report from reporting_obligations
  where record_id=p_report_record_id
  for update;
  if not found then raise exception 'Reporting obligation not found'; end if;
  if v_report.workflow_status <> 'SUBMITTED' then raise exception 'Report must be SUBMITTED before completion'; end if;
  if not exists(select 1 from report_submissions where reporting_obligation_id=v_report.id) then raise exception 'No report submission is recorded'; end if;
  if not exists(select 1 from evidence_links where record_id=p_report_record_id) then raise exception 'Submission/receipt evidence is required'; end if;

  update reporting_obligations set workflow_status='COMPLETED',updated_at=now() where id=v_report.id;
  update records set lifecycle_status='CLOSED',closed_at=now(),updated_at=now() where id=p_report_record_id;
  insert into record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_report_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,trim(p_reason));

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_report_record_id,'reporting_obligations',v_report.id,'REPORT_CONFIRM_RECEIVED',
    jsonb_build_object('workflow_status',v_report.workflow_status),jsonb_build_object('workflow_status','COMPLETED'),
    trim(p_reason),jsonb_build_object('source','qlcl-ui','transaction','qlcl_confirm_report_received_v1')
  );

  return jsonb_build_object('ok',true,'status','COMPLETED');
end;
$$;

revoke all on function qlcl_approve_proposal_create_project_v1(uuid,uuid,date,date,text) from public,anon,authenticated;
grant execute on function qlcl_approve_proposal_create_project_v1(uuid,uuid,date,date,text) to service_role;
revoke all on function qlcl_close_audit_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function qlcl_close_audit_v1(uuid,uuid,text) to service_role;
revoke all on function qlcl_submit_report_v1(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function qlcl_submit_report_v1(uuid,uuid,text,text,text) to service_role;
revoke all on function qlcl_confirm_report_received_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function qlcl_confirm_report_received_v1(uuid,uuid,text) to service_role;

commit;
