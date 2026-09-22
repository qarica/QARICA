create or replace function public.qlcl_audit_scope_mutate_v1(
  p_audit_record_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_scope_id uuid,
  p_department_id uuid,
  p_process_name text,
  p_area_name text,
  p_scope_description text,
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
  v_existing public.audit_scopes%rowtype;
  v_actor_org uuid;
  v_actor_active boolean;
  v_action text := upper(trim(coalesce(p_action,'')));
  v_process text := nullif(trim(coalesce(p_process_name,'')),'');
  v_area text := nullif(trim(coalesce(p_area_name,'')),'');
  v_description text := nullif(trim(coalesce(p_scope_description,'')),'');
  v_scope_id uuid;
  v_department_org uuid;
begin
  if p_audit_record_id is null or p_actor_user_id is null then
    raise exception 'Required Audit scope parameters are missing';
  end if;
  if v_action not in ('ADD','UPDATE','DELETE') then
    raise exception 'Unsupported Audit scope action %',v_action;
  end if;

  select organization_id,is_active into v_actor_org,v_actor_active
  from public.profiles where user_id=p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active,false) then
    raise exception 'Audit actor is not active';
  end if;

  select * into v_record
  from public.records
  where id=p_audit_record_id and record_type='AUDIT'
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
  if v_audit.workflow_status <> 'DRAFT' then
    raise exception 'Audit scope may only be edited while DRAFT';
  end if;

  if p_department_id is not null then
    select organization_id into v_department_org
    from public.departments
    where id=p_department_id and is_active=true;
    if v_department_org is null or v_department_org is distinct from v_actor_org then
      raise exception 'Audit scope department is invalid';
    end if;
  end if;

  if v_action='DELETE' then
    if p_scope_id is null then raise exception 'Audit scope id is required'; end if;
    if length(trim(coalesce(p_reason,''))) < 3 then
      raise exception 'Audit scope delete reason is required';
    end if;

    select * into v_existing
    from public.audit_scopes
    where id=p_scope_id and audit_id=v_audit.id
    for update;
    if not found then raise exception 'Audit scope not found'; end if;

    delete from public.audit_scopes where id=v_existing.id;

    insert into public.audit_logs(
      actor_user_id,record_id,table_name,row_id,action_type,
      old_value,new_value,reason,request_meta
    ) values (
      p_actor_user_id,p_audit_record_id,'audit_scopes',v_existing.id,'AUDIT_SCOPE_DELETE',
      to_jsonb(v_existing),null,trim(p_reason),
      jsonb_build_object('source','qlcl-ui','transaction','qlcl_audit_scope_mutate_v1')
    );

    return jsonb_build_object('ok',true,'action','DELETE','scope_id',v_existing.id);
  end if;

  if p_department_id is null and v_process is null and v_area is null and v_description is null then
    raise exception 'Audit scope content is required';
  end if;

  if exists(
    select 1 from public.audit_scopes s
    where s.audit_id=v_audit.id
      and coalesce(s.department_id::text,'')=coalesce(p_department_id::text,'')
      and coalesce(trim(s.process_name),'')=coalesce(v_process,'')
      and coalesce(trim(s.area_name),'')=coalesce(v_area,'')
      and (v_action='ADD' or s.id<>p_scope_id)
  ) then
    raise exception 'Duplicate Audit scope';
  end if;

  if v_action='ADD' then
    insert into public.audit_scopes(
      audit_id,department_id,process_name,area_name,scope_description
    ) values (
      v_audit.id,p_department_id,v_process,v_area,v_description
    )
    returning id into v_scope_id;

    insert into public.audit_logs(
      actor_user_id,record_id,table_name,row_id,action_type,
      old_value,new_value,reason,request_meta
    ) values (
      p_actor_user_id,p_audit_record_id,'audit_scopes',v_scope_id,'AUDIT_SCOPE_ADD',
      null,
      jsonb_build_object(
        'department_id',p_department_id,
        'process_name',v_process,
        'area_name',v_area,
        'scope_description',v_description
      ),
      null,
      jsonb_build_object('source','qlcl-ui','transaction','qlcl_audit_scope_mutate_v1')
    );

    return jsonb_build_object('ok',true,'action','ADD','scope_id',v_scope_id);
  end if;

  if p_scope_id is null then raise exception 'Audit scope id is required'; end if;
  select * into v_existing
  from public.audit_scopes
  where id=p_scope_id and audit_id=v_audit.id
  for update;
  if not found then raise exception 'Audit scope not found'; end if;

  update public.audit_scopes
  set department_id=p_department_id,
      process_name=v_process,
      area_name=v_area,
      scope_description=v_description
  where id=v_existing.id;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_audit_record_id,'audit_scopes',v_existing.id,'AUDIT_SCOPE_UPDATE',
    to_jsonb(v_existing),
    jsonb_build_object(
      'department_id',p_department_id,
      'process_name',v_process,
      'area_name',v_area,
      'scope_description',v_description
    ),
    coalesce(nullif(trim(coalesce(p_reason,'')),''),'Điều chỉnh phạm vi Audit khi còn nháp.'),
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_audit_scope_mutate_v1')
  );

  return jsonb_build_object('ok',true,'action','UPDATE','scope_id',v_existing.id);
end;
$$;

create or replace function public.qlcl_audit_session_mutate_v1(
  p_audit_record_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_session_id uuid,
  p_department_id uuid,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_location text,
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
  v_existing public.audit_sessions%rowtype;
  v_actor_org uuid;
  v_actor_active boolean;
  v_action text := upper(trim(coalesce(p_action,'')));
  v_location text := nullif(trim(coalesce(p_location,'')),'');
  v_session_id uuid;
  v_department_org uuid;
begin
  if p_audit_record_id is null or p_actor_user_id is null then
    raise exception 'Required Audit session parameters are missing';
  end if;
  if v_action not in ('ADD','UPDATE','DELETE') then
    raise exception 'Unsupported Audit session action %',v_action;
  end if;

  select organization_id,is_active into v_actor_org,v_actor_active
  from public.profiles where user_id=p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active,false) then
    raise exception 'Audit actor is not active';
  end if;

  select * into v_record
  from public.records
  where id=p_audit_record_id and record_type='AUDIT'
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
  if v_audit.workflow_status <> 'IN_PROGRESS' then
    raise exception 'Audit session may only be edited while IN_PROGRESS';
  end if;

  if p_department_id is not null then
    select organization_id into v_department_org
    from public.departments
    where id=p_department_id and is_active=true;
    if v_department_org is null or v_department_org is distinct from v_actor_org then
      raise exception 'Audit session department is invalid';
    end if;
  end if;

  if v_action='DELETE' then
    if p_session_id is null then raise exception 'Audit session id is required'; end if;
    if length(trim(coalesce(p_reason,''))) < 3 then
      raise exception 'Audit session delete reason is required';
    end if;

    select * into v_existing
    from public.audit_sessions
    where id=p_session_id and audit_id=v_audit.id
    for update;
    if not found then raise exception 'Audit session not found'; end if;
    if coalesce(v_existing.session_status,'PLANNED') <> 'PLANNED' then
      raise exception 'Only PLANNED Audit sessions may be deleted';
    end if;

    delete from public.audit_sessions where id=v_existing.id;

    insert into public.audit_logs(
      actor_user_id,record_id,table_name,row_id,action_type,
      old_value,new_value,reason,request_meta
    ) values (
      p_actor_user_id,p_audit_record_id,'audit_sessions',v_existing.id,'AUDIT_SESSION_DELETE',
      to_jsonb(v_existing),null,trim(p_reason),
      jsonb_build_object('source','qlcl-ui','transaction','qlcl_audit_session_mutate_v1')
    );

    return jsonb_build_object('ok',true,'action','DELETE','session_id',v_existing.id);
  end if;

  if p_scheduled_start is null then raise exception 'Audit session start is required'; end if;
  if p_scheduled_end is not null and p_scheduled_end <= p_scheduled_start then
    raise exception 'Audit session end must be after start';
  end if;

  if exists(
    select 1 from public.audit_sessions s
    where s.audit_id=v_audit.id
      and s.scheduled_start=p_scheduled_start
      and (v_action='ADD' or s.id<>p_session_id)
  ) then
    raise exception 'Duplicate Audit session start';
  end if;

  if v_action='ADD' then
    insert into public.audit_sessions(
      audit_id,scheduled_start,scheduled_end,department_id,location,session_status
    ) values (
      v_audit.id,p_scheduled_start,p_scheduled_end,p_department_id,v_location,'PLANNED'
    )
    returning id into v_session_id;

    insert into public.audit_logs(
      actor_user_id,record_id,table_name,row_id,action_type,
      old_value,new_value,reason,request_meta
    ) values (
      p_actor_user_id,p_audit_record_id,'audit_sessions',v_session_id,'AUDIT_SESSION_ADD',
      null,
      jsonb_build_object(
        'scheduled_start',p_scheduled_start,
        'scheduled_end',p_scheduled_end,
        'department_id',p_department_id,
        'location',v_location,
        'session_status','PLANNED'
      ),
      null,
      jsonb_build_object('source','qlcl-ui','transaction','qlcl_audit_session_mutate_v1')
    );

    return jsonb_build_object('ok',true,'action','ADD','session_id',v_session_id);
  end if;

  if p_session_id is null then raise exception 'Audit session id is required'; end if;
  select * into v_existing
  from public.audit_sessions
  where id=p_session_id and audit_id=v_audit.id
  for update;
  if not found then raise exception 'Audit session not found'; end if;
  if coalesce(v_existing.session_status,'PLANNED') <> 'PLANNED' then
    raise exception 'Only PLANNED Audit sessions may be updated';
  end if;

  update public.audit_sessions
  set scheduled_start=p_scheduled_start,
      scheduled_end=p_scheduled_end,
      department_id=p_department_id,
      location=v_location
  where id=v_existing.id;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_audit_record_id,'audit_sessions',v_existing.id,'AUDIT_SESSION_UPDATE',
    to_jsonb(v_existing),
    jsonb_build_object(
      'scheduled_start',p_scheduled_start,
      'scheduled_end',p_scheduled_end,
      'department_id',p_department_id,
      'location',v_location,
      'session_status',v_existing.session_status
    ),
    coalesce(nullif(trim(coalesce(p_reason,'')),''),'Điều chỉnh lịch phiên Audit còn PLANNED.'),
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_audit_session_mutate_v1')
  );

  return jsonb_build_object('ok',true,'action','UPDATE','session_id',v_existing.id);
end;
$$;

revoke execute on function public.qlcl_audit_scope_mutate_v1(uuid,uuid,text,uuid,uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.qlcl_audit_scope_mutate_v1(uuid,uuid,text,uuid,uuid,text,text,text,text)
  to service_role;

revoke execute on function public.qlcl_audit_session_mutate_v1(uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text,text)
  from public, anon, authenticated;
grant execute on function public.qlcl_audit_session_mutate_v1(uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text,text)
  to service_role;
