-- QLCL-TTSG Plan Action Transaction V1
-- Keeps program_action_links for progress semantics and canonical HAS_ACTION for traceability.

begin;

create or replace function qlcl_create_plan_action_v1(
  p_program_id uuid,
  p_actor_user_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_program work_programs%rowtype;
  v_source records%rowtype;
  v_action_record_id uuid;
  v_action_id uuid;
  v_record_code text;
  v_title text:=trim(coalesce(p_payload->>'title',''));
  v_description text:=nullif(trim(coalesce(p_payload->>'description','')),'');
  v_priority text:=upper(coalesce(nullif(trim(p_payload->>'priority'),''),'NORMAL'));
  v_lead_department_id uuid;
  v_assignee_user_id uuid;
  v_start_date date;
  v_due_date date;
  v_expected_result text:=trim(coalesce(p_payload->>'expected_result',''));
  v_verification_requirement text:=nullif(trim(coalesce(p_payload->>'verification_requirement','')),'');
  v_milestone_group text:=nullif(trim(coalesce(p_payload->>'milestone_group','')),'');
  v_is_required boolean:=coalesce((p_payload->>'is_required')::boolean,true);
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'payload must be a JSON object'; end if;

  select * into v_program from work_programs where id=p_program_id for update;
  if not found then raise exception 'Program not found'; end if;
  if v_program.workflow_status<>'IN_PROGRESS' then raise exception 'Program must be IN_PROGRESS'; end if;

  select * into v_source from records where id=v_program.record_id and record_type='PROGRAM' for update;
  if not found then raise exception 'Program Registry record not found'; end if;
  if v_source.lifecycle_status<>'ACTIVE' then raise exception 'Program Registry record must be ACTIVE'; end if;

  if v_title='' then raise exception 'Action title is required'; end if;
  if v_expected_result='' then raise exception 'Expected result is required'; end if;
  if v_priority not in ('LOW','NORMAL','HIGH','URGENT','CRITICAL') then raise exception 'Invalid Action priority'; end if;
  begin v_lead_department_id:=(p_payload->>'lead_department_id')::uuid; exception when others then raise exception 'Valid lead_department_id is required'; end;
  begin v_assignee_user_id:=(p_payload->>'assignee_user_id')::uuid; exception when others then raise exception 'Valid assignee_user_id is required'; end;
  begin v_due_date:=(p_payload->>'due_date')::date; exception when others then raise exception 'Valid due_date is required'; end;
  if nullif(trim(coalesce(p_payload->>'start_date','')),'') is not null then
    begin v_start_date:=(p_payload->>'start_date')::date; exception when others then raise exception 'Invalid start_date'; end;
  end if;
  if v_start_date is not null and v_due_date<v_start_date then raise exception 'due_date cannot be before start_date'; end if;

  if not exists(select 1 from profiles p where p.user_id=p_actor_user_id and p.organization_id=v_source.organization_id and p.is_active) then
    raise exception 'Actor is invalid or outside organization';
  end if;
  if not exists(select 1 from departments d where d.id=v_lead_department_id and d.organization_id=v_source.organization_id and d.is_active) then
    raise exception 'Lead department is invalid or outside organization';
  end if;
  if not exists(select 1 from profiles p where p.user_id=v_assignee_user_id and p.organization_id=v_source.organization_id and p.is_active) then
    raise exception 'Assignee is invalid or outside organization';
  end if;

  select next_record_code('ACTION',v_source.work_year) into v_record_code;
  if coalesce(v_record_code,'')='' then raise exception 'Could not allocate Action record code'; end if;

  insert into records(
    organization_id,record_type,record_code,title,work_year,owner_department_id,owner_user_id,lifecycle_status,created_by
  ) values(
    v_source.organization_id,'ACTION',v_record_code,v_title,v_source.work_year,v_lead_department_id,v_assignee_user_id,'ACTIVE',p_actor_user_id
  ) returning id into v_action_record_id;

  insert into actions(
    record_id,description,priority,lead_department_id,assignee_user_id,start_date,due_date,expected_result,verification_requirement,workflow_status
  ) values(
    v_action_record_id,v_description,v_priority,v_lead_department_id,v_assignee_user_id,v_start_date,v_due_date,v_expected_result,v_verification_requirement,'NOT_STARTED'
  ) returning id into v_action_id;

  insert into program_action_links(program_id,action_id,relation_type,milestone_group,is_required)
  values(p_program_id,v_action_id,'DELIVERS',v_milestone_group,v_is_required);

  insert into record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
  values(
    v_source.id,v_action_record_id,'HAS_ACTION',
    jsonb_build_object('source_record_type','PROGRAM','source_record_code',v_source.record_code,'program_id',p_program_id),p_actor_user_id
  );

  insert into notifications(
    recipient_user_id,notification_type,priority,title,message,target_record_id,target_route,notification_event_key,is_read
  ) values(
    v_assignee_user_id,'ACTION_ASSIGNED',v_priority,'Bạn được giao công việc mới',v_title,
    v_action_record_id,'/tasks/'||v_action_record_id,'action-assigned:'||v_action_id||':'||v_assignee_user_id,false
  ) on conflict(recipient_user_id,notification_event_key) do nothing;

  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,new_value,request_meta)
  values(
    p_actor_user_id,v_source.id,'program_action_links',v_action_id,'CREATE_PLAN_ACTION',
    jsonb_build_object('program_id',p_program_id,'action_record_id',v_action_record_id,'action_id',v_action_id,'title',v_title,'due_date',v_due_date,'is_required',v_is_required),
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_create_plan_action_v1')
  );

  return jsonb_build_object('ok',true,'action_id',v_action_id,'record_id',v_action_record_id,'record_code',v_record_code,'program_id',p_program_id);
end;
$$;

revoke all on function qlcl_create_plan_action_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function qlcl_create_plan_action_v1(uuid,uuid,jsonb) to service_role;

commit;
