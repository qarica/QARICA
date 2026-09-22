-- Reconcile Production incident start-investigation RPC into repository lineage.
-- Adds a meaningful audit reason without adding a user step.
create or replace function public.qlcl_start_incident_investigation_v1(
  p_incident_record_id uuid,
  p_actor_user_id uuid,
  p_investigation_type text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  insert into incident_investigations(incident_id,investigation_type,started_at,rca_required,status)
  values(v_incident.id,trim(p_investigation_type),now(),coalesce(v_incident.rca_required,false),'IN_PROGRESS')
  returning id into v_investigation_id;

  update incidents set workflow_status='INVESTIGATING',updated_at=now() where id=v_incident.id;

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_incident_record_id,'incidents',v_incident.id,'INCIDENT_START_INVESTIGATION',
    jsonb_build_object('workflow_status',v_incident.workflow_status),
    jsonb_build_object('workflow_status','INVESTIGATING','investigation_id',v_investigation_id),
    'Bắt đầu điều tra sự cố; loại điều tra: ' || trim(p_investigation_type) || '.',
    jsonb_build_object('source','qlcl-ui','sensitive',true,'transaction','qlcl_start_incident_investigation_v1')
  );

  return jsonb_build_object('ok',true,'status','INVESTIGATING','investigation_id',v_investigation_id);
end;
$function$;
