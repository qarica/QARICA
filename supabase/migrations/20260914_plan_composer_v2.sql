-- QLCL-TTSG Plan Composer V2
-- Structured plan drafting + atomic materialization of draft tasks on approval.

begin;

alter table if exists public.work_programs
  add column if not exists general_objective text,
  add column if not exists specific_objectives jsonb not null default '[]'::jsonb,
  add column if not exists requirements text,
  add column if not exists draft_actions jsonb not null default '[]'::jsonb,
  add column if not exists revision_no integer not null default 1,
  add column if not exists returned_reason text,
  add column if not exists submitted_at timestamptz,
  add column if not exists returned_at timestamptz;

alter table if exists public.actions
  add column if not exists criteria_refs jsonb not null default '[]'::jsonb,
  add column if not exists collaborating_department_ids uuid[] not null default '{}'::uuid[];

-- Backfill older plans so current objective remains visible as the general objective.
update public.work_programs
set general_objective = objective
where general_objective is null and objective is not null;

create or replace function public.qlcl_approve_plan_bundle_v2(
  p_program_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_program public.work_programs%rowtype;
  v_record public.records%rowtype;
  v_actor public.profiles%rowtype;
  v_task jsonb;
  v_action_record_id uuid;
  v_action_id uuid;
  v_record_code text;
  v_title text;
  v_lead_department_id uuid;
  v_assignee_user_id uuid;
  v_start_date date;
  v_due_date date;
  v_priority text;
  v_expected_result text;
  v_verification_requirement text;
  v_description text;
  v_milestone_group text;
  v_is_required boolean;
  v_criteria_refs jsonb;
  v_collaborating_department_ids uuid[];
  v_count integer:=0;
begin
  select * into v_actor from public.profiles where user_id=p_actor_user_id and is_active for update;
  if not found or v_actor.organization_id is null then raise exception 'Actor profile is invalid'; end if;

  select * into v_program from public.work_programs where id=p_program_id for update;
  if not found then raise exception 'Plan not found'; end if;
  if v_program.workflow_status<>'PENDING_APPROVAL' then raise exception 'Plan must be pending approval'; end if;

  select * into v_record from public.records where id=v_program.record_id for update;
  if not found or v_record.organization_id<>v_actor.organization_id or v_record.lifecycle_status<>'ACTIVE' then raise exception 'Plan record is invalid or outside organization'; end if;

  if nullif(trim(coalesce(v_program.general_objective,'')),'') is null then raise exception 'General objective is required'; end if;
  if jsonb_typeof(v_program.specific_objectives)<>'array' or jsonb_array_length(v_program.specific_objectives)<1 then raise exception 'At least one specific objective is required'; end if;
  if nullif(trim(coalesce(v_program.requirements,'')),'') is null then raise exception 'Requirements are required'; end if;
  if jsonb_typeof(v_program.draft_actions)<>'array' or jsonb_array_length(v_program.draft_actions)<1 then raise exception 'At least one plan task is required'; end if;

  for v_task in select value from jsonb_array_elements(v_program.draft_actions)
  loop
    v_title:=trim(coalesce(v_task->>'title',''));
    if v_title='' then raise exception 'Task title is required'; end if;
    begin v_lead_department_id:=(v_task->>'lead_department_id')::uuid; exception when others then raise exception 'Task lead department is invalid'; end;
    begin v_assignee_user_id:=(v_task->>'assignee_user_id')::uuid; exception when others then raise exception 'Task assignee is invalid'; end;
    v_start_date:=nullif(v_task->>'start_date','')::date;
    v_due_date:=nullif(v_task->>'due_date','')::date;
    if v_due_date is null then raise exception 'Task due date is required'; end if;
    if v_start_date is not null and v_due_date<v_start_date then raise exception 'Task due date cannot be before start date'; end if;
    v_priority:=upper(coalesce(nullif(trim(v_task->>'priority'),''),'NORMAL'));
    if v_priority not in ('LOW','NORMAL','HIGH','URGENT','CRITICAL') then raise exception 'Task priority is invalid'; end if;
    v_expected_result:=trim(coalesce(v_task->>'expected_result',''));
    if v_expected_result='' then raise exception 'Task expected result is required'; end if;
    v_verification_requirement:=nullif(trim(coalesce(v_task->>'verification_requirement','')),'');
    v_description:=nullif(trim(coalesce(v_task->>'description','')),'');
    v_milestone_group:=nullif(trim(coalesce(v_task->>'milestone_group','')),'');
    v_is_required:=coalesce((v_task->>'is_required')::boolean,true);
    v_criteria_refs:=coalesce(v_task->'criteria_refs','[]'::jsonb);
    if jsonb_typeof(v_criteria_refs)<>'array' then raise exception 'Task criteria refs must be an array'; end if;

    begin
      select coalesce(array_agg(value::uuid),'{}'::uuid[])
      into v_collaborating_department_ids
      from jsonb_array_elements_text(coalesce(v_task->'collaborating_department_ids','[]'::jsonb));
    exception when others then
      raise exception 'Task collaborating departments contain invalid ids';
    end;

    if not exists(select 1 from public.departments d where d.id=v_lead_department_id and d.organization_id=v_actor.organization_id and d.is_active) then
      raise exception 'Task lead department is invalid or outside organization';
    end if;
    if not exists(select 1 from public.profiles p where p.user_id=v_assignee_user_id and p.organization_id=v_actor.organization_id and p.is_active) then
      raise exception 'Task assignee is invalid or outside organization';
    end if;
    if cardinality(v_collaborating_department_ids)>0 and exists(
      select 1 from unnest(v_collaborating_department_ids) x
      where not exists(select 1 from public.departments d where d.id=x and d.organization_id=v_actor.organization_id and d.is_active)
    ) then raise exception 'One or more collaborating departments are invalid'; end if;

    select public.next_record_code('ACTION',v_record.work_year) into v_record_code;
    insert into public.records(organization_id,record_type,record_code,title,work_year,owner_department_id,owner_user_id,lifecycle_status,created_by)
    values(v_actor.organization_id,'ACTION',v_record_code,v_title,v_record.work_year,v_lead_department_id,v_assignee_user_id,'ACTIVE',p_actor_user_id)
    returning id into v_action_record_id;

    insert into public.actions(record_id,description,priority,lead_department_id,assignee_user_id,start_date,due_date,expected_result,verification_requirement,workflow_status,criteria_refs,collaborating_department_ids)
    values(v_action_record_id,v_description,v_priority,v_lead_department_id,v_assignee_user_id,v_start_date,v_due_date,v_expected_result,v_verification_requirement,'NOT_STARTED',v_criteria_refs,v_collaborating_department_ids)
    returning id into v_action_id;

    insert into public.program_action_links(program_id,action_id,relation_type,milestone_group,is_required,sequence_no)
    values(p_program_id,v_action_id,'DELIVERS',v_milestone_group,v_is_required,v_count+1);

    insert into public.record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
    values(v_record.id,v_action_record_id,'HAS_ACTION',jsonb_build_object('source_record_type','PROGRAM','source_record_code',v_record.record_code,'program_id',p_program_id,'criteria_refs',v_criteria_refs),p_actor_user_id);

    insert into public.notifications(recipient_user_id,notification_type,priority,title,message,target_record_id,target_route,notification_event_key,is_read)
    values(v_assignee_user_id,'ACTION_ASSIGNED',v_priority,'Bạn được giao công việc mới',v_title,v_action_record_id,'/tasks/'||v_action_record_id::text,'action-assigned:'||v_action_id::text||':'||v_assignee_user_id::text,false)
    on conflict(recipient_user_id,notification_event_key) do nothing;

    v_count:=v_count+1;
  end loop;

  update public.work_programs
  set workflow_status='APPROVED', approved_by=p_actor_user_id, approved_at=now(), returned_reason=null
  where id=p_program_id and workflow_status='PENDING_APPROVAL';

  insert into public.audit_logs(actor_user_id,record_id,table_name,row_id,action_type,new_value,request_meta)
  values(p_actor_user_id,v_record.id,'work_programs',p_program_id,'APPROVE_PLAN_BUNDLE',jsonb_build_object('program_id',p_program_id,'materialized_actions',v_count,'revision_no',v_program.revision_no),jsonb_build_object('source','qlcl-ui','transaction','atomic'));

  return jsonb_build_object('ok',true,'program_id',p_program_id,'materialized_actions',v_count,'approved_at',now());
end;
$$;

revoke all on function public.qlcl_approve_plan_bundle_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.qlcl_approve_plan_bundle_v2(uuid,uuid) to service_role;

commit;
