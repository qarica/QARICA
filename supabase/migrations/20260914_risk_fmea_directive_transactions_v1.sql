-- QLCL-TTSG Risk / FMEA / Directive Transactions V1
-- Atomic Risk acceptance/retire, FMEA close and Directive completion.
-- Apply only after backup, preflight and preview CI PASS.

begin;

create or replace function qlcl_accept_risk_v1(
  p_risk_record_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_acceptance_reason text,
  p_next_review_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_record records%rowtype;
  v_risk risks%rowtype;
  v_assessment_id uuid;
  v_new_status text;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if p_decision not in ('ACCEPT','ACCEPT_WITH_MONITORING','NOT_ACCEPTED','ESCALATE') then raise exception 'Invalid risk decision'; end if;
  if coalesce(trim(p_acceptance_reason),'')='' then raise exception 'Risk acceptance reason is required'; end if;
  if p_decision='ACCEPT_WITH_MONITORING' and p_next_review_date is null then raise exception 'Next review date is required'; end if;
  if p_next_review_date is not null and p_next_review_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Next review date cannot be in the past'; end if;

  select * into v_record from records where id=p_risk_record_id and record_type='RISK' for update;
  if not found then raise exception 'Risk record not found'; end if;
  if v_record.lifecycle_status not in ('ACTIVE') then raise exception 'Risk record is not active'; end if;

  select * into v_risk from risks where record_id=p_risk_record_id for update;
  if not found then raise exception 'Risk domain row not found'; end if;
  if v_risk.workflow_status not in ('ASSESSED','MONITORING') then raise exception 'Risk is not at a decision gate'; end if;

  select id into v_assessment_id from risk_assessments
  where risk_id=v_risk.id
  order by assessment_date desc,created_at desc
  limit 1;
  if v_assessment_id is null then raise exception 'Risk assessment is required before decision'; end if;

  insert into risk_acceptances(
    risk_id,risk_assessment_id,decision,accepted_by,acceptance_reason,next_review_date
  ) values (
    v_risk.id,v_assessment_id,p_decision,p_actor_user_id,trim(p_acceptance_reason),p_next_review_date
  );

  v_new_status:=case
    when p_decision='ACCEPT' then 'RISK_ACCEPTED'
    when p_decision='ACCEPT_WITH_MONITORING' then 'MONITORING'
    else 'TREATMENT_REQUIRED'
  end;

  update risks
  set workflow_status=v_new_status,
      next_review_date=coalesce(p_next_review_date,v_risk.next_review_date),
      updated_at=now()
  where id=v_risk.id;

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_risk_record_id,'risks',v_risk.id,'RISK_ACCEPT',
    jsonb_build_object('workflow_status',v_risk.workflow_status),
    jsonb_build_object('workflow_status',v_new_status,'decision',p_decision,'assessment_id',v_assessment_id),
    trim(p_acceptance_reason),jsonb_build_object('source','qlcl-ui','transaction','qlcl_accept_risk_v1')
  );

  return jsonb_build_object('ok',true,'status',v_new_status,'decision',p_decision,'assessment_id',v_assessment_id);
end;
$$;

create or replace function qlcl_retire_risk_v1(
  p_risk_record_id uuid,
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
  v_risk risks%rowtype;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Risk retire reason is required'; end if;

  select * into v_record from records where id=p_risk_record_id and record_type='RISK' for update;
  if not found then raise exception 'Risk record not found'; end if;
  if v_record.lifecycle_status not in ('ACTIVE') then raise exception 'Risk record is not active'; end if;

  select * into v_risk from risks where record_id=p_risk_record_id for update;
  if not found then raise exception 'Risk domain row not found'; end if;
  if v_risk.workflow_status not in ('RISK_ACCEPTED','MONITORING') then raise exception 'Risk is not eligible for retire'; end if;

  update risks set workflow_status='RETIRED',retired_at=now(),retired_reason=trim(p_reason),updated_at=now() where id=v_risk.id;
  update records set lifecycle_status='RETIRED',closed_at=now(),updated_at=now() where id=p_risk_record_id;
  insert into record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_risk_record_id,v_record.lifecycle_status,'RETIRED',p_actor_user_id,trim(p_reason));

  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
  values(
    p_actor_user_id,p_risk_record_id,'risks',v_risk.id,'RISK_RETIRE',
    jsonb_build_object('workflow_status',v_risk.workflow_status),jsonb_build_object('workflow_status','RETIRED'),
    trim(p_reason),jsonb_build_object('source','qlcl-ui','transaction','qlcl_retire_risk_v1')
  );
  return jsonb_build_object('ok',true,'status','RETIRED');
end;
$$;

create or replace function qlcl_close_fmea_v1(
  p_fmea_record_id uuid,
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
  v_study fmea_studies%rowtype;
  v_high integer;
  v_action_count integer;
  v_incomplete integer;
  v_evidence integer;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Residual risk acceptance conclusion is required'; end if;

  select * into v_record from records where id=p_fmea_record_id and record_type='FMEA' for update;
  if not found then raise exception 'FMEA record not found'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'FMEA record is not active'; end if;
  select * into v_study from fmea_studies where record_id=p_fmea_record_id for update;
  if not found then raise exception 'FMEA study not found'; end if;
  if v_study.workflow_status <> 'RESIDUAL_REVIEW' then raise exception 'FMEA must be RESIDUAL_REVIEW before close'; end if;

  select count(*) into v_high
  from fmea_failure_modes fm
  join fmea_process_steps ps on ps.id=fm.process_step_id
  where ps.fmea_study_id=v_study.id and coalesce(fm.is_high_priority,false)=true;

  select count(*) into v_action_count from record_links
  where source_record_id=p_fmea_record_id and relation_type='HAS_ACTION';
  if v_high>0 and v_action_count<1 then raise exception 'High-priority failure modes require intervention Actions'; end if;

  select count(*) into v_incomplete
  from record_links l join actions a on a.record_id=l.target_record_id
  where l.source_record_id=p_fmea_record_id and l.relation_type='HAS_ACTION'
    and coalesce(a.workflow_status,'') not in ('COMPLETED','CANCELLED','NOT_APPLICABLE');
  if v_incomplete>0 then raise exception 'FMEA has % incomplete Action(s)',v_incomplete; end if;

  select count(*) into v_evidence from evidence_links where record_id=p_fmea_record_id;
  if v_evidence<1 then raise exception 'FMEA intervention/re-score evidence is required'; end if;

  update fmea_studies set workflow_status='CLOSED',updated_at=now() where id=v_study.id;
  update records set lifecycle_status='CLOSED',closed_at=now(),updated_at=now() where id=p_fmea_record_id;
  insert into record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_fmea_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,trim(p_reason));
  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
  values(
    p_actor_user_id,p_fmea_record_id,'fmea_studies',v_study.id,'FMEA_CLOSE',
    jsonb_build_object('workflow_status',v_study.workflow_status),jsonb_build_object('workflow_status','CLOSED'),
    trim(p_reason),jsonb_build_object('source','qlcl-ui','transaction','qlcl_close_fmea_v1')
  );
  return jsonb_build_object('ok',true,'status','CLOSED','action_count',v_action_count,'evidence_count',v_evidence);
end;
$$;

create or replace function qlcl_complete_directive_v1(
  p_directive_record_id uuid,
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
  v_directive external_directives%rowtype;
  v_action_count integer;
  v_incomplete integer;
  v_evidence integer;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Directive completion conclusion is required'; end if;

  select * into v_record from records where id=p_directive_record_id and record_type='DIRECTIVE' for update;
  if not found then raise exception 'Directive record not found'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'Directive record is not active'; end if;
  select * into v_directive from external_directives where record_id=p_directive_record_id for update;
  if not found then raise exception 'Directive domain row not found'; end if;
  if v_directive.workflow_status <> 'EVIDENCE_SUBMITTED' then raise exception 'Directive must be EVIDENCE_SUBMITTED before completion'; end if;

  select count(*) into v_action_count from directive_action_links where directive_id=v_directive.id;
  if v_action_count<1 then raise exception 'Directive requires at least one Action'; end if;
  select count(*) into v_incomplete
  from directive_action_links l join actions a on a.id=l.action_id
  where l.directive_id=v_directive.id and coalesce(a.workflow_status,'') not in ('COMPLETED','CANCELLED','NOT_APPLICABLE');
  if v_incomplete>0 then raise exception 'Directive has % incomplete Action(s)',v_incomplete; end if;
  select count(*) into v_evidence from evidence_links where record_id=p_directive_record_id;
  if v_evidence<1 then raise exception 'Directive completion evidence is required'; end if;

  update external_directives set workflow_status='COMPLETED',updated_at=now() where id=v_directive.id;
  update records set lifecycle_status='CLOSED',closed_at=now(),updated_at=now() where id=p_directive_record_id;
  insert into record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_directive_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,trim(p_reason));
  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
  values(
    p_actor_user_id,p_directive_record_id,'external_directives',v_directive.id,'DIRECTIVE_COMPLETE',
    jsonb_build_object('workflow_status',v_directive.workflow_status),jsonb_build_object('workflow_status','COMPLETED'),
    trim(p_reason),jsonb_build_object('source','qlcl-ui','transaction','qlcl_complete_directive_v1')
  );
  return jsonb_build_object('ok',true,'status','COMPLETED');
end;
$$;

revoke all on function qlcl_accept_risk_v1(uuid,uuid,text,text,date) from public,anon,authenticated;
grant execute on function qlcl_accept_risk_v1(uuid,uuid,text,text,date) to service_role;
revoke all on function qlcl_retire_risk_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function qlcl_retire_risk_v1(uuid,uuid,text) to service_role;
revoke all on function qlcl_close_fmea_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function qlcl_close_fmea_v1(uuid,uuid,text) to service_role;
revoke all on function qlcl_complete_directive_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function qlcl_complete_directive_v1(uuid,uuid,text) to service_role;

commit;
