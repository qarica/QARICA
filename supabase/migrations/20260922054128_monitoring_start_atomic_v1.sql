create or replace function public.qlcl_monitoring_start_v1(
  p_round_id uuid,
  p_actor_user_id uuid,
  p_started_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.monitoring_rounds%rowtype;
  v_record public.records%rowtype;
  v_actor_org uuid;
  v_actor_active boolean;
begin
  if p_round_id is null or p_actor_user_id is null or p_started_at is null then
    raise exception 'Required monitoring start parameters are missing';
  end if;

  select organization_id,is_active into v_actor_org,v_actor_active
  from public.profiles
  where user_id=p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active,false) then
    raise exception 'Monitoring actor is not active';
  end if;

  select * into v_round
  from public.monitoring_rounds
  where id=p_round_id
  for update;
  if not found then raise exception 'Monitoring round not found'; end if;
  if v_round.workflow_status <> 'SCHEDULED' then
    raise exception 'Monitoring round must be SCHEDULED';
  end if;

  select * into v_record
  from public.records
  where id=v_round.record_id
  for share;
  if not found or v_record.organization_id is distinct from v_actor_org then
    raise exception 'Monitoring round is outside current organization';
  end if;

  update public.monitoring_rounds
  set workflow_status='IN_PROGRESS',
      started_at=p_started_at
  where id=p_round_id;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  )
  values(
    p_actor_user_id,v_round.record_id,'monitoring_rounds',p_round_id,
    'MONITORING_START',
    jsonb_build_object('workflow_status',v_round.workflow_status,'started_at',v_round.started_at),
    jsonb_build_object('workflow_status','IN_PROGRESS','started_at',p_started_at),
    null,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_monitoring_start_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'status','IN_PROGRESS',
    'started_at',p_started_at
  );
end;
$$;

revoke execute on function public.qlcl_monitoring_start_v1(uuid,uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.qlcl_monitoring_start_v1(uuid,uuid,timestamptz)
  to service_role;
