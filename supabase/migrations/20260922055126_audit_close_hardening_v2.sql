create or replace function public.qlcl_close_audit_v1(
  p_audit_record_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.records%rowtype;
  v_audit public.audits%rowtype;
  v_actor_org uuid;
  v_actor_active boolean;
  v_open integer;
  v_closed_at timestamptz := now();
begin
  if p_audit_record_id is null or p_actor_user_id is null then
    raise exception 'Required audit close parameters are missing';
  end if;
  if coalesce(trim(p_reason),'')='' then
    raise exception 'Audit close conclusion is required';
  end if;

  select organization_id,is_active
  into v_actor_org,v_actor_active
  from public.profiles
  where user_id=p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active,false) then
    raise exception 'Audit actor is not active';
  end if;

  select * into v_record
  from public.records
  where id=p_audit_record_id
    and record_type='AUDIT'
  for update;
  if not found then raise exception 'Audit record not found'; end if;
  if v_record.organization_id is distinct from v_actor_org then
    raise exception 'Audit record is outside current organization';
  end if;
  if v_record.lifecycle_status <> 'ACTIVE' then
    raise exception 'Audit record is not active';
  end if;

  select * into v_audit
  from public.audits
  where record_id=p_audit_record_id
  for update;
  if not found then raise exception 'Audit domain row not found'; end if;
  if v_audit.workflow_status <> 'FOLLOW_UP' then
    raise exception 'Audit must be FOLLOW_UP before close';
  end if;

  select count(*) into v_open
  from public.audit_finding_links l
  join public.findings f on f.id=l.finding_id
  where l.audit_id=v_audit.id
    and coalesce(f.workflow_status,'') not in ('CLOSED','CANCELLED');
  if v_open > 0 then
    raise exception 'Audit has % open Finding(s)',v_open;
  end if;

  update public.audits
  set workflow_status='CLOSED',
      closed_at=v_closed_at,
      updated_at=v_closed_at
  where id=v_audit.id;

  update public.records
  set lifecycle_status='CLOSED',
      closed_at=v_closed_at,
      updated_at=v_closed_at
  where id=p_audit_record_id;

  insert into public.record_status_history(
    record_id,old_status,new_status,changed_by,reason
  )
  values(
    p_audit_record_id,v_record.lifecycle_status,'CLOSED',
    p_actor_user_id,trim(p_reason)
  );

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  )
  values(
    p_actor_user_id,p_audit_record_id,'audits',v_audit.id,'AUDIT_CLOSE',
    jsonb_build_object('workflow_status',v_audit.workflow_status),
    jsonb_build_object('workflow_status','CLOSED','closed_at',v_closed_at),
    trim(p_reason),
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_close_audit_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'status','CLOSED',
    'closed_at',v_closed_at
  );
end;
$$;

revoke execute on function public.qlcl_close_audit_v1(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.qlcl_close_audit_v1(uuid,uuid,text)
  to service_role;
