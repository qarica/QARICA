-- Generic linked Action V2: primary assignment can be either one user or one reusable group.
create or replace function public.qlcl_create_linked_action_v2(
  p_source_record_id uuid,
  p_actor_user_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source public.records%rowtype;
  v_action_record_id uuid;
  v_action_id uuid;
  v_record_code text;
  v_title text:=trim(coalesce(p_payload->>'title',''));
  v_description text:=nullif(trim(coalesce(p_payload->>'description','')),'');
  v_priority text:=upper(coalesce(nullif(trim(p_payload->>'priority'),''),'NORMAL'));
  v_lead_department_id uuid;
  v_assignment_target_type text;
  v_assignee_user_id uuid;
  v_assignee_group_id uuid;
  v_start_date date;
  v_due_date date;
  v_expected_result text:=trim(coalesce(p_payload->>'expected_result',''));
  v_verification_requirement text:=nullif(trim(coalesce(p_payload->>'verification_requirement','')),'');
  v_capa_action_type text:=upper(coalesce(nullif(trim(p_payload->>'capa_action_type'),''),'CORRECTIVE'));
  v_risk_treatment_type text:=upper(coalesce(nullif(trim(p_payload->>'risk_treatment_type'),''),'REDUCE'));
  v_failure_mode_id uuid;
  v_root_id uuid;
  v_root_cause_ids jsonb:=coalesce(p_payload->'root_cause_ids','[]'::jsonb);
  v_rca_analysis_id uuid;
  v_root_link_count integer:=0;
  v_group_snapshot jsonb:='[]'::jsonb;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'payload must be a JSON object'; end if;
  if jsonb_typeof(v_root_cause_ids)<>'array' then raise exception 'root_cause_ids must be a JSON array'; end if;

  select * into v_source from public.records where id=p_source_record_id for update;
  if not found then raise exception 'Source record not found'; end if;
  if v_source.lifecycle_status<>'ACTIVE' then raise exception 'Source record must be ACTIVE'; end if;
  if v_source.record_type not in ('DIRECTIVE','REPORT','INSPECTION','INDICATOR_MEASUREMENT','FINDING','INCIDENT','CAPA','RISK','FMEA','IMPROVEMENT_PROPOSAL','IMPROVEMENT_PROJECT','ASSESSMENT','EXTERNAL_ASSESSMENT','AUDIT','SAFETY_ALERT','FEEDBACK') then
    raise exception 'Source record type % does not support generic linked Action creation',v_source.record_type;
  end if;

  if v_title='' then raise exception 'Action title is required'; end if;
  if v_expected_result='' then raise exception 'Expected result is required'; end if;
  if v_priority not in ('LOW','NORMAL','HIGH','URGENT','CRITICAL') then raise exception 'Invalid Action priority'; end if;

  begin v_lead_department_id:=(p_payload->>'lead_department_id')::uuid; exception when others then raise exception 'Valid lead_department_id is required'; end;
  begin v_due_date:=(p_payload->>'due_date')::date; exception when others then raise exception 'Valid due_date is required'; end;
  if nullif(trim(coalesce(p_payload->>'start_date','')),'') is not null then
    begin v_start_date:=(p_payload->>'start_date')::date; exception when others then raise exception 'Invalid start_date'; end;
  end if;
  if v_start_date is not null and v_due_date<v_start_date then raise exception 'due_date cannot be before start_date'; end if;

  v_assignment_target_type:=upper(coalesce(
    nullif(trim(p_payload->>'assignment_target_type'),''),
    case when nullif(trim(coalesce(p_payload->>'assignee_group_id','')),'') is not null then 'GROUP' else 'USER' end
  ));
  if v_assignment_target_type not in ('USER','GROUP') then raise exception 'Invalid assignment target type'; end if;

  if v_assignment_target_type='USER' then
    begin v_assignee_user_id:=(p_payload->>'assignee_user_id')::uuid; exception when others then raise exception 'Valid assignee_user_id is required'; end;
  else
    begin v_assignee_group_id:=(p_payload->>'assignee_group_id')::uuid; exception when others then raise exception 'Valid assignee_group_id is required'; end;
  end if;

  if not exists(
    select 1 from public.departments d
    where d.id=v_lead_department_id and d.organization_id=v_source.organization_id and d.is_active
  ) then raise exception 'Lead department is invalid or outside organization'; end if;

  if not exists(
    select 1 from public.profiles p
    where p.user_id=p_actor_user_id and p.organization_id=v_source.organization_id and p.is_active
  ) then raise exception 'Actor is invalid or outside organization'; end if;

  if v_assignment_target_type='USER' then
    if not exists(
      select 1 from public.profiles p
      where p.user_id=v_assignee_user_id and p.organization_id=v_source.organization_id and p.is_active
    ) then raise exception 'Assignee is invalid or outside organization'; end if;
  else
    if not exists(
      select 1 from public.work_groups g
      where g.id=v_assignee_group_id and g.organization_id=v_source.organization_id and g.is_active
    ) then raise exception 'Assignee group is invalid or outside organization'; end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id',m.user_id,
          'member_role',m.member_role,
          'snapshot_at',now()
        )
        order by case m.member_role when 'LEADER' then 1 when 'DEPUTY' then 2 when 'SECRETARY' then 3 else 4 end,
                 m.created_at
      ) filter (where m.id is not null),
      '[]'::jsonb
    )
    into v_group_snapshot
    from public.work_group_members m
    join public.profiles p on p.user_id=m.user_id
    where m.group_id=v_assignee_group_id
      and m.is_active
      and p.organization_id=v_source.organization_id
      and p.is_active;

    if jsonb_array_length(v_group_snapshot)=0 then raise exception 'Assignee group has no active members'; end if;
  end if;

  if v_source.record_type='CAPA' then
    if v_capa_action_type not in ('CORRECTION','CORRECTIVE','PREVENTIVE','VERIFICATION') then raise exception 'Invalid CAPA action type'; end if;
    select rca_analysis_id into v_rca_analysis_id from public.capas where record_id=p_source_record_id;
    if v_rca_analysis_id is not null and v_capa_action_type in ('CORRECTIVE','PREVENTIVE') and jsonb_array_length(v_root_cause_ids)=0 then
      raise exception 'Corrective/preventive CAPA Action must be linked to at least one RCA root cause';
    end if;
  end if;
  if v_source.record_type='RISK' and v_risk_treatment_type not in ('AVOID','REDUCE','TRANSFER','ACCEPT','CONTINGENCY') then raise exception 'Invalid risk treatment type'; end if;

  if v_source.record_type='FMEA' then
    begin v_failure_mode_id:=(p_payload->>'failure_mode_id')::uuid; exception when others then raise exception 'Valid failure_mode_id is required for FMEA Action'; end;
    if not exists(
      select 1
      from public.fmea_failure_modes fm
      join public.fmea_process_steps ps on ps.id=fm.process_step_id
      join public.fmea_studies fs on fs.id=ps.fmea_study_id
      where fm.id=v_failure_mode_id and fs.record_id=p_source_record_id
    ) then raise exception 'Failure mode not found in source FMEA'; end if;
  end if;

  select public.next_record_code(v_source.organization_id,'ACTION',v_source.work_year) into v_record_code;
  if coalesce(v_record_code,'')='' then raise exception 'Could not allocate Action record code'; end if;

  insert into public.records(
    organization_id,record_type,record_code,title,work_year,owner_department_id,owner_user_id,lifecycle_status,created_by
  ) values(
    v_source.organization_id,'ACTION',v_record_code,v_title,v_source.work_year,v_lead_department_id,
    case when v_assignment_target_type='USER' then v_assignee_user_id else null end,
    'ACTIVE',p_actor_user_id
  ) returning id into v_action_record_id;

  insert into public.actions(
    record_id,title,description,priority,lead_department_id,assignment_target_type,assignee_user_id,assignee_group_id,
    start_date,due_date,expected_result,verification_requirement,workflow_status
  ) values(
    v_action_record_id,v_title,v_description,v_priority,v_lead_department_id,v_assignment_target_type,
    case when v_assignment_target_type='USER' then v_assignee_user_id else null end,
    case when v_assignment_target_type='GROUP' then v_assignee_group_id else null end,
    v_start_date,v_due_date,v_expected_result,v_verification_requirement,'NOT_STARTED'
  ) returning id into v_action_id;

  insert into public.record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
  values(
    p_source_record_id,v_action_record_id,'HAS_ACTION',
    jsonb_strip_nulls(jsonb_build_object(
      'source_record_type',v_source.record_type,
      'source_record_code',v_source.record_code,
      'failure_mode_id',v_failure_mode_id,
      'root_cause_ids',v_root_cause_ids,
      'assignment_target_type',v_assignment_target_type,
      'assignee_group_id',v_assignee_group_id
    )),
    p_actor_user_id
  );

  if v_source.record_type='DIRECTIVE' then
    select id into v_root_id from public.external_directives where record_id=p_source_record_id;
    if v_root_id is null then raise exception 'Directive domain row not found'; end if;
    insert into public.directive_action_links(directive_id,action_id,relation_type) values(v_root_id,v_action_id,'REQUIRES');
  elsif v_source.record_type='FINDING' then
    select id into v_root_id from public.findings where record_id=p_source_record_id;
    if v_root_id is null then raise exception 'Finding domain row not found'; end if;
    insert into public.finding_action_links(finding_id,action_id,action_role) values(v_root_id,v_action_id,'CORRECTIVE');
  elsif v_source.record_type='CAPA' then
    select id into v_root_id from public.capas where record_id=p_source_record_id;
    if v_root_id is null then raise exception 'CAPA domain row not found'; end if;
    insert into public.capa_action_links(capa_id,action_id,action_type) values(v_root_id,v_action_id,v_capa_action_type);
  elsif v_source.record_type='RISK' then
    select id into v_root_id from public.risks where record_id=p_source_record_id;
    if v_root_id is null then raise exception 'Risk domain row not found'; end if;
    insert into public.risk_action_links(risk_id,action_id,treatment_type) values(v_root_id,v_action_id,v_risk_treatment_type);
  elsif v_source.record_type='INSPECTION' then
    select id into v_root_id from public.inspection_events where record_id=p_source_record_id;
    if v_root_id is null then raise exception 'Inspection domain row not found'; end if;
    insert into public.inspection_action_links(inspection_event_id,action_id,offset_days) values(v_root_id,v_action_id,null);
  elsif v_source.record_type='FMEA' then
    insert into public.fmea_failure_mode_action_links(failure_mode_id,action_record_id,created_by)
    values(v_failure_mode_id,v_action_record_id,p_actor_user_id);
  end if;

  if jsonb_array_length(v_root_cause_ids)>0 then
    v_root_link_count:=public.qlcl_attach_action_root_causes_v1(
      p_source_record_id,v_action_id,p_actor_user_id,v_root_cause_ids
    );
  end if;

  if v_assignment_target_type='USER' then
    insert into public.notifications(
      recipient_user_id,notification_type,priority,title,message,target_record_id,target_route,notification_event_key,is_read
    ) values(
      v_assignee_user_id,'ACTION_ASSIGNED',v_priority,'Bạn được giao công việc mới',
      v_title||' · nguồn '||v_source.record_code,v_action_record_id,'/tasks/'||v_action_record_id,
      'record-action:'||p_source_record_id||':'||v_action_id||':'||v_assignee_user_id,false
    ) on conflict(recipient_user_id,notification_event_key) do nothing;
  else
    insert into public.work_group_assignment_snapshots(
      organization_id,group_id,target_record_id,assignment_role,member_snapshot,created_by
    ) values(
      v_source.organization_id,v_assignee_group_id,v_action_record_id,'ACTION_ASSIGNEE_GROUP',v_group_snapshot,p_actor_user_id
    )
    on conflict(group_id,target_record_id,assignment_role) do nothing;

    insert into public.notifications(
      recipient_user_id,notification_type,priority,title,message,target_record_id,target_route,notification_event_key,is_read
    )
    select
      (member->>'user_id')::uuid,'ACTION_GROUP_ASSIGNED',v_priority,'Nhóm của bạn được giao công việc mới',
      v_title||' · nguồn '||v_source.record_code,v_action_record_id,'/tasks/'||v_action_record_id,
      'record-group-action:'||p_source_record_id||':'||v_action_id||':'||(member->>'user_id'),false
    from jsonb_array_elements(v_group_snapshot) member
    on conflict(recipient_user_id,notification_event_key) do nothing;
  end if;

  insert into public.audit_logs(actor_user_id,record_id,table_name,row_id,action_type,new_value,request_meta)
  values(
    p_actor_user_id,p_source_record_id,'record_links',v_action_record_id,'CREATE_LINKED_ACTION',
    jsonb_strip_nulls(jsonb_build_object(
      'action_record_id',v_action_record_id,
      'action_id',v_action_id,
      'title',v_title,
      'due_date',v_due_date,
      'assignment_target_type',v_assignment_target_type,
      'assignee_user_id',v_assignee_user_id,
      'assignee_group_id',v_assignee_group_id,
      'failure_mode_id',v_failure_mode_id,
      'root_cause_ids',v_root_cause_ids,
      'root_cause_link_count',v_root_link_count
    )),
    jsonb_build_object('source','qlcl-ui','source_record_type',v_source.record_type,'transaction','qlcl_create_linked_action_v2')
  );

  return jsonb_strip_nulls(jsonb_build_object(
    'ok',true,
    'action_id',v_action_id,
    'record_id',v_action_record_id,
    'record_code',v_record_code,
    'assignment_target_type',v_assignment_target_type,
    'assignee_group_id',v_assignee_group_id,
    'source_record_type',v_source.record_type,
    'failure_mode_id',v_failure_mode_id,
    'root_cause_link_count',v_root_link_count
  ));
end;
$function$;

revoke all on function public.qlcl_create_linked_action_v2(uuid,uuid,jsonb) from public;
revoke all on function public.qlcl_create_linked_action_v2(uuid,uuid,jsonb) from anon;
revoke all on function public.qlcl_create_linked_action_v2(uuid,uuid,jsonb) from authenticated;
grant execute on function public.qlcl_create_linked_action_v2(uuid,uuid,jsonb) to service_role;
