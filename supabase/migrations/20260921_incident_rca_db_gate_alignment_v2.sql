-- Align incident RCA DB gates with UI/API policy.
-- Five Why is optional; if used it must contain at least 3 levels.
-- An Action is mandatory at close only when structured RCA is required.

create or replace function public.qlcl_complete_incident_investigation_v1(
  p_incident_record_id uuid, p_actor_user_id uuid, p_verified_event_summary text,
  p_harm_conclusion text, p_conclusion text, p_reason text default null
) returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_record records%rowtype; v_incident incidents%rowtype; v_inv incident_investigations%rowtype;
  v_rca rca_analyses%rowtype; v_reason text; v_factor_count integer:=0; v_timeline_count integer:=0;
  v_why_count integer:=0; v_fishbone_count integer:=0; v_root_count integer:=0;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_verified_event_summary),'')='' or coalesce(trim(p_harm_conclusion),'')='' or coalesce(trim(p_conclusion),'')='' then
    raise exception 'Verified event summary, harm conclusion and investigation conclusion are required';
  end if;
  select * into v_record from records where id=p_incident_record_id and record_type='INCIDENT' for update;
  if not found then raise exception 'Incident record not found'; end if;
  if v_record.lifecycle_status<>'ACTIVE' then raise exception 'Incident record is not active'; end if;
  select * into v_incident from incidents where record_id=p_incident_record_id for update;
  if not found then raise exception 'Incident domain row not found'; end if;
  if v_incident.workflow_status<>'INVESTIGATING' then raise exception 'Incident must be INVESTIGATING'; end if;
  select * into v_inv from incident_investigations where incident_id=v_incident.id and status='IN_PROGRESS' order by created_at desc limit 1 for update;
  if not found then raise exception 'No active investigation found'; end if;
  if coalesce(v_incident.rca_required,false) then
    select count(*) into v_factor_count from incident_contributing_factors where incident_id=v_incident.id;
    if v_factor_count<1 then raise exception 'RCA requires at least one structured contributing factor before investigation completion'; end if;
    select * into v_rca from rca_analyses where incident_id=v_incident.id for update;
    if not found then raise exception 'Structured RCA is required before investigation completion'; end if;
    select count(*) into v_timeline_count from rca_timeline_events where rca_analysis_id=v_rca.id;
    select count(*) into v_why_count from rca_five_whys where rca_analysis_id=v_rca.id;
    select count(*) into v_fishbone_count from rca_fishbone_factors where rca_analysis_id=v_rca.id;
    select count(*) into v_root_count from rca_root_causes where rca_analysis_id=v_rca.id;
    if v_timeline_count<1 or v_fishbone_count<1 or v_root_count<1 or (v_why_count>0 and v_why_count<3) then
      raise exception 'Structured RCA gate incomplete: Timeline >=1, Fishbone >=1, Root Cause >=1; Five Why optional but >=3 when used';
    end if;
    update rca_analyses set status='COMPLETED',completed_at=coalesce(completed_at,now()) where id=v_rca.id;
  end if;
  update incident_investigations set verified_event_summary=trim(p_verified_event_summary),harm_conclusion=trim(p_harm_conclusion),
    conclusion=trim(p_conclusion),status='COMPLETED',completed_at=now() where id=v_inv.id;
  update incidents set workflow_status='ACTION_FOLLOW_UP',updated_at=now() where id=v_incident.id;
  v_reason:=coalesce(nullif(trim(p_reason),''),'Hoàn tất điều tra và chuyển theo dõi hành động phòng ngừa tái diễn.');
  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
  values(p_actor_user_id,p_incident_record_id,'incidents',v_incident.id,'INCIDENT_COMPLETE_INVESTIGATION',
    jsonb_build_object('workflow_status',v_incident.workflow_status),
    jsonb_build_object('workflow_status','ACTION_FOLLOW_UP','investigation_id',v_inv.id,'rca_required',coalesce(v_incident.rca_required,false),
      'contributing_factor_count',v_factor_count,'rca_timeline_count',v_timeline_count,'rca_five_why_count',v_why_count,
      'rca_fishbone_count',v_fishbone_count,'rca_root_cause_count',v_root_count),
    v_reason,jsonb_build_object('source','qlcl-ui','sensitive',true,'transaction','qlcl_complete_incident_investigation_v1','gate','combined_rca_v2'));
  return jsonb_build_object('ok',true,'status','ACTION_FOLLOW_UP','investigation_id',v_inv.id,'rca_required',coalesce(v_incident.rca_required,false),
    'contributing_factor_count',v_factor_count,'rca_timeline_count',v_timeline_count,'rca_five_why_count',v_why_count,
    'rca_fishbone_count',v_fishbone_count,'rca_root_cause_count',v_root_count);
end;$function$;

create or replace function public.qlcl_close_incident_v1(p_incident_record_id uuid,p_actor_user_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_record records%rowtype; v_incident incidents%rowtype; v_trace jsonb; v_action_count integer; v_incomplete integer;
  v_evidence integer; v_required_root_count integer; v_uncovered_root_count integer; v_ineffective_capa_count integer;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Incident close conclusion is required'; end if;
  select * into v_record from records where id=p_incident_record_id and record_type='INCIDENT' for update;
  if not found then raise exception 'Incident record not found'; end if;
  if v_record.lifecycle_status<>'ACTIVE' then raise exception 'Incident record is not active'; end if;
  select * into v_incident from incidents where record_id=p_incident_record_id for update;
  if not found then raise exception 'Incident domain row not found'; end if;
  if v_incident.workflow_status<>'AWAITING_CLOSURE' then raise exception 'Incident must be AWAITING_CLOSURE'; end if;
  v_trace:=public.qlcl_incident_action_trace_state_v1(p_incident_record_id);
  v_action_count:=coalesce((v_trace->>'action_count')::integer,0);
  v_incomplete:=coalesce((v_trace->>'incomplete_action_count')::integer,0);
  v_required_root_count:=coalesce((v_trace->>'required_root_count')::integer,0);
  v_uncovered_root_count:=coalesce((v_trace->>'uncovered_root_count')::integer,0);
  v_ineffective_capa_count:=coalesce((v_trace->>'ineffective_capa_count')::integer,0);
  if coalesce(v_incident.rca_required,false) then
    if nullif(v_trace->>'rca_analysis_id','') is null then raise exception 'Completed structured RCA is required before incident close'; end if;
    if v_required_root_count<1 then raise exception 'RCA must identify at least one root cause requiring action'; end if;
    if v_uncovered_root_count>0 then raise exception 'Incident has % RCA root cause(s) without an active linked Action',v_uncovered_root_count; end if;
    if v_ineffective_capa_count>0 then raise exception 'Linked CAPA must be EFFECTIVE or CLOSED before incident close'; end if;
    if v_action_count<1 then raise exception 'At least one Action is required for an incident with required RCA'; end if;
  end if;
  if v_incomplete>0 then raise exception 'Incident has % incomplete Action(s)',v_incomplete; end if;
  select count(*) into v_evidence from evidence_links where record_id=p_incident_record_id;
  if v_evidence<1 then raise exception 'Incident handling evidence is required'; end if;
  update incidents set workflow_status='CLOSED',closed_at=now(),updated_at=now() where id=v_incident.id;
  update records set lifecycle_status='CLOSED',closed_at=now(),updated_at=now() where id=p_incident_record_id;
  insert into record_status_history(record_id,old_status,new_status,changed_by,reason)
    values(p_incident_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,trim(p_reason));
  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
    values(p_actor_user_id,p_incident_record_id,'incidents',v_incident.id,'INCIDENT_CLOSE',
      jsonb_build_object('workflow_status',v_incident.workflow_status),jsonb_build_object('workflow_status','CLOSED','trace_state',v_trace),
      trim(p_reason),jsonb_build_object('source','qlcl-ui','sensitive',true,'transaction','qlcl_close_incident_v1'));
  return jsonb_build_object('ok',true,'status','CLOSED','action_count',v_action_count,'evidence_count',v_evidence,'trace_state',v_trace);
end;$function$;
