-- QLCL-TTSG Incident Transactions V1
-- Atomic start investigation, complete investigation and close incident.
-- Apply only after backup, preflight and preview CI PASS.

begin;

-- At most one active investigation per incident.
do $$
begin
  if exists (
    select 1 from incident_investigations
    where status='IN_PROGRESS'
    group by incident_id
    having count(*) > 1
  ) then
    raise exception 'Multiple active investigations exist for one or more incidents. Resolve before migration.';
  end if;
end $$;

create unique index if not exists uq_incident_one_active_investigation
  on incident_investigations(incident_id)
  where status='IN_PROGRESS';

create or replace function qlcl_start_incident_investigation_v1(
  p_incident_record_id uuid,
  p_actor_user_id uuid,
  p_investigation_type text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_record records%rowtype;
  v_incident incidents%rowtype;
  v_investigation_id uuid;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_investigation_type),'')='' then raise exception 'investigation_type is required'; end if;

  select * into v_record from records
  where id=p_incident_record_id and record_type='INCIDENT'
  for update;
  if not found then raise exception 'Incident record not found'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'Incident record is not active'; end if;

  select * into v_incident from incidents
  where record_id=p_incident_record_id
  for update;
  if not found then raise exception 'Incident domain row not found'; end if;
  if v_incident.workflow_status <> 'INVESTIGATION_REQUIRED' then raise exception 'Incident must be INVESTIGATION_REQUIRED'; end if;
  if exists(select 1 from incident_investigations where incident_id=v_incident.id and status='IN_PROGRESS') then raise exception 'Incident already has an active investigation'; end if;

  insert into incident_investigations(
    incident_id,investigation_type,started_at,rca_required,status
  ) values (
    v_incident.id,trim(p_investigation_type),now(),coalesce(v_incident.rca_required,false),'IN_PROGRESS'
  ) returning id into v_investigation_id;

  update incidents set workflow_status='INVESTIGATING',updated_at=now() where id=v_incident.id;

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,request_meta
  ) values (
    p_actor_user_id,p_incident_record_id,'incidents',v_incident.id,'INCIDENT_START_INVESTIGATION',
    jsonb_build_object('workflow_status',v_incident.workflow_status),
    jsonb_build_object('workflow_status','INVESTIGATING','investigation_id',v_investigation_id),
    jsonb_build_object('source','qlcl-ui','sensitive',true,'transaction','qlcl_start_incident_investigation_v1')
  );

  return jsonb_build_object('ok',true,'status','INVESTIGATING','investigation_id',v_investigation_id);
end;
$$;

create or replace function qlcl_complete_incident_investigation_v1(
  p_incident_record_id uuid,
  p_actor_user_id uuid,
  p_verified_event_summary text,
  p_harm_conclusion text,
  p_conclusion text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_record records%rowtype;
  v_incident incidents%rowtype;
  v_inv incident_investigations%rowtype;
  v_reason text;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_verified_event_summary),'')='' or coalesce(trim(p_harm_conclusion),'')='' or coalesce(trim(p_conclusion),'')='' then
    raise exception 'Verified event summary, harm conclusion and investigation conclusion are required';
  end if;

  select * into v_record from records
  where id=p_incident_record_id and record_type='INCIDENT'
  for update;
  if not found then raise exception 'Incident record not found'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'Incident record is not active'; end if;

  select * into v_incident from incidents
  where record_id=p_incident_record_id
  for update;
  if not found then raise exception 'Incident domain row not found'; end if;
  if v_incident.workflow_status <> 'INVESTIGATING' then raise exception 'Incident must be INVESTIGATING'; end if;

  select * into v_inv from incident_investigations
  where incident_id=v_incident.id and status='IN_PROGRESS'
  order by created_at desc
  limit 1
  for update;
  if not found then raise exception 'No active investigation found'; end if;

  update incident_investigations
  set verified_event_summary=trim(p_verified_event_summary),harm_conclusion=trim(p_harm_conclusion),
      conclusion=trim(p_conclusion),status='COMPLETED',completed_at=now()
  where id=v_inv.id;

  update incidents set workflow_status='ACTION_FOLLOW_UP',updated_at=now() where id=v_incident.id;
  v_reason:=coalesce(nullif(trim(p_reason),''),'Hoàn tất điều tra và chuyển theo dõi hành động phòng ngừa tái diễn.');

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_incident_record_id,'incidents',v_incident.id,'INCIDENT_COMPLETE_INVESTIGATION',
    jsonb_build_object('workflow_status',v_incident.workflow_status),
    jsonb_build_object('workflow_status','ACTION_FOLLOW_UP','investigation_id',v_inv.id),
    v_reason,jsonb_build_object('source','qlcl-ui','sensitive',true,'transaction','qlcl_complete_incident_investigation_v1')
  );

  return jsonb_build_object('ok',true,'status','ACTION_FOLLOW_UP','investigation_id',v_inv.id);
end;
$$;

create or replace function qlcl_close_incident_v1(
  p_incident_record_id uuid,
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
  v_incident incidents%rowtype;
  v_action_count integer;
  v_incomplete integer;
  v_evidence integer;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Incident close conclusion is required'; end if;

  select * into v_record from records
  where id=p_incident_record_id and record_type='INCIDENT'
  for update;
  if not found then raise exception 'Incident record not found'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'Incident record is not active'; end if;

  select * into v_incident from incidents
  where record_id=p_incident_record_id
  for update;
  if not found then raise exception 'Incident domain row not found'; end if;
  if v_incident.workflow_status <> 'AWAITING_CLOSURE' then raise exception 'Incident must be AWAITING_CLOSURE'; end if;

  select count(*) into v_action_count
  from record_links l
  where l.source_record_id=p_incident_record_id and l.relation_type='HAS_ACTION';
  if v_action_count < 1 then raise exception 'At least one Action is required before incident close'; end if;

  select count(*) into v_incomplete
  from record_links l
  join actions a on a.record_id=l.target_record_id
  where l.source_record_id=p_incident_record_id and l.relation_type='HAS_ACTION'
    and coalesce(a.workflow_status,'') not in ('COMPLETED','CANCELLED','NOT_APPLICABLE');
  if v_incomplete > 0 then raise exception 'Incident has % incomplete Action(s)',v_incomplete; end if;

  select count(*) into v_evidence from evidence_links where record_id=p_incident_record_id;
  if v_evidence < 1 then raise exception 'Incident handling evidence is required'; end if;

  update incidents set workflow_status='CLOSED',closed_at=now(),updated_at=now() where id=v_incident.id;
  update records set lifecycle_status='CLOSED',closed_at=now(),updated_at=now() where id=p_incident_record_id;
  insert into record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_incident_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,trim(p_reason));

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_incident_record_id,'incidents',v_incident.id,'INCIDENT_CLOSE',
    jsonb_build_object('workflow_status',v_incident.workflow_status),jsonb_build_object('workflow_status','CLOSED'),
    trim(p_reason),jsonb_build_object('source','qlcl-ui','sensitive',true,'transaction','qlcl_close_incident_v1')
  );

  return jsonb_build_object('ok',true,'status','CLOSED','action_count',v_action_count,'evidence_count',v_evidence);
end;
$$;

revoke all on function qlcl_start_incident_investigation_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function qlcl_start_incident_investigation_v1(uuid,uuid,text) to service_role;
revoke all on function qlcl_complete_incident_investigation_v1(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function qlcl_complete_incident_investigation_v1(uuid,uuid,text,text,text,text) to service_role;
revoke all on function qlcl_close_incident_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function qlcl_close_incident_v1(uuid,uuid,text) to service_role;

commit;
