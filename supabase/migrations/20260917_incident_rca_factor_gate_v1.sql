-- QARICA RCA contributing-factor gate V1

create or replace function public.qlcl_complete_incident_investigation_v1(
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
set search_path = public
as $$
declare
  v_record records%rowtype;
  v_incident incidents%rowtype;
  v_inv incident_investigations%rowtype;
  v_reason text;
  v_factor_count integer;
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

  if coalesce(v_incident.rca_required,false) then
    select count(*) into v_factor_count
    from incident_contributing_factors
    where incident_id=v_incident.id;
    if v_factor_count < 1 then
      raise exception 'RCA requires at least one structured contributing factor before investigation completion';
    end if;
  end if;

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
    jsonb_build_object('workflow_status','ACTION_FOLLOW_UP','investigation_id',v_inv.id,'contributing_factor_count',coalesce(v_factor_count,0)),
    v_reason,jsonb_build_object('source','qlcl-ui','sensitive',true,'transaction','qlcl_complete_incident_investigation_v1')
  );

  return jsonb_build_object('ok',true,'status','ACTION_FOLLOW_UP','investigation_id',v_inv.id,'contributing_factor_count',coalesce(v_factor_count,0));
end;
$$;

revoke all on function public.qlcl_complete_incident_investigation_v1(uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.qlcl_complete_incident_investigation_v1(uuid,uuid,text,text,text,text) to service_role;
