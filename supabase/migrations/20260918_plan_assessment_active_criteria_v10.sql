-- Plan Automation V10: assessment outputs only materialize active criteria/subitems from the published criteria version.
-- Action assignment V2: plan tasks can be assigned primarily to one user OR one reusable group.
-- Plan Composer V6: recurring monitoring schedules are materialized into Recurring Work Engine templates.
-- Plan Composer V5: multi-output task materialization. One Action may create multiple linked domain outputs atomically.
-- Plan Composer V4.1: reusable work-group expansion and immutable assignment snapshots.
-- Plan Composer V4: collaborative assignees and parent-child action materialization.
-- Extend Plan Automation V2 monitoring outputs to support whole-area monitoring.
-- Replaces the same v4 RPC signature so existing API callers stay compatible.

-- Action ownership V3: allow a plan-generated Action to be owned by a department before a specific user/group is assigned.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid='public.actions'::regclass
    and contype='c'
    and pg_get_constraintdef(oid) ilike '%assignment_target_type%'
  limit 1;

  if v_constraint_name is not null then
    execute format('alter table public.actions drop constraint %I', v_constraint_name);
  end if;

  alter table public.actions
    add constraint actions_assignment_target_type_check
    check (assignment_target_type = any (array['DEPARTMENT'::text,'USER'::text,'GROUP'::text]));
end $$;

-- Distinguish operational units that participate in hospital-wide execution from executive-only units.
alter table public.departments add column if not exists is_operational_unit boolean not null default true;
update public.departments set is_operational_unit=false where code='BAN_GIAM_DOC';

-- Per-department execution tracking for one shared Action.
-- Keeps one source Action while allowing hospital-wide work to be followed by department.
create table if not exists public.action_department_executions (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.actions(id) on delete cascade,
  department_id uuid not null references public.departments(id),
  workflow_status text not null default 'NOT_STARTED'
    check (workflow_status in ('NOT_STARTED','IN_PROGRESS','SUBMITTED','VERIFIED','OVERDUE','WAIVED')),
  due_date date,
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(user_id),
  verified_at timestamptz,
  verified_by uuid references public.profiles(user_id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(action_id, department_id)
);

create index if not exists idx_action_department_executions_department
  on public.action_department_executions(department_id, workflow_status);
create index if not exists idx_action_department_executions_action
  on public.action_department_executions(action_id, workflow_status);

alter table public.action_department_executions enable row level security;

create or replace function public.qlcl_approve_plan_bundle_v10(
  p_program_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_program public.work_programs%rowtype;
  v_record public.records%rowtype;
  v_actor public.profiles%rowtype;
  v_task jsonb;
  v_output jsonb;
  v_automation_outputs jsonb;

  v_action_record_id uuid;
  v_action_id uuid;
  v_record_code text;
  v_title text;
  v_client_id text;
  v_lead_department_id uuid;
  v_execution_scope text;
  v_execution_department_ids uuid[];
  v_assignment_target_type text;
  v_assignee_user_id uuid;
  v_assignee_group_id uuid;
  v_operational_owner_user_id uuid;
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
  v_collaborating_user_ids uuid[];
  v_collaborating_group_ids uuid[];
  v_group_id uuid;
  v_group_snapshot jsonb;
  v_parent_client_id text;
  v_parent_action_id uuid;

  v_automation_kind text;
  v_automation_confirmed boolean;
  v_automation_ref_id uuid;
  v_automation_target_department_id uuid;
  v_automation_target_area text;
  v_monitoring_recurrence text;
  v_monitoring_recurrence_end_date date;
  v_monitoring_recurrence_rule text;
  v_monitoring_schedule_end date;
  v_recurring_template_id uuid;
  v_recurring_template_ids jsonb := '[]'::jsonb;
  v_report_recipient text;
  v_report_method text;
  v_report_period text;
  v_report_recurrence_rule text;
  v_report_recurrence_end_date date;
  v_assessment_round_type text;
  v_audit_type text;

  v_indicator_assignment public.indicator_assignments%rowtype;
  v_checklist_version public.checklist_versions%rowtype;
  v_checklist_template public.checklist_templates%rowtype;
  v_criteria_version public.criteria_set_versions%rowtype;
  v_criteria_set public.criteria_sets%rowtype;
  v_output_record_id uuid;
  v_output_domain_id uuid;
  v_output_code text;
  v_output_owner_department_id uuid;
  v_output_owner_user_id uuid;
  v_period_start date;

  v_count integer := 0;
  v_indicator_count integer := 0;
  v_monitoring_count integer := 0;
  v_report_count integer := 0;
  v_assessment_count integer := 0;
  v_audit_count integer := 0;
  v_improvement_count integer := 0;
  v_recurring_monitoring_count integer := 0;
begin
  select * into v_actor
  from public.profiles
  where user_id=p_actor_user_id and is_active
  for update;
  if not found or v_actor.organization_id is null then
    raise exception 'Actor profile is invalid';
  end if;

  select * into v_program
  from public.work_programs
  where id=p_program_id
  for update;
  if not found then raise exception 'Plan not found'; end if;
  if v_program.workflow_status<>'PENDING_APPROVAL' then
    raise exception 'Plan must be pending approval';
  end if;

  select * into v_record
  from public.records
  where id=v_program.record_id
  for update;
  if not found
     or v_record.organization_id<>v_actor.organization_id
     or v_record.lifecycle_status<>'ACTIVE' then
    raise exception 'Plan record is invalid or outside organization';
  end if;

  if nullif(trim(coalesce(v_program.general_objective,'')),'') is null then
    raise exception 'General objective is required';
  end if;
  if jsonb_typeof(v_program.draft_actions)<>'array'
     or jsonb_array_length(v_program.draft_actions)<1 then
    raise exception 'At least one plan task is required';
  end if;

  -- Defense in depth: unresolved source data must never materialize into operational Actions.
  if exists (
    select 1
    from jsonb_array_elements(v_program.draft_actions) task
    where coalesce((task->>'needs_confirmation')::boolean,false)
       or (
         upper(coalesce(nullif(trim(task->>'execution_scope'),''),'LEAD_DEPARTMENT'))='LEAD_DEPARTMENT'
         and nullif(trim(coalesce(task->>'lead_department_id','')),'') is null
       )
  ) then
    raise exception 'Plan contains unresolved tasks requiring confirmation or lead department';
  end if;

  if cardinality(coalesce(v_program.assigned_group_ids,'{}'::uuid[]))>0 then
    if exists(
      select 1 from unnest(v_program.assigned_group_ids) gid
      where not exists(
        select 1 from public.work_groups g
        where g.id=gid
          and g.organization_id=v_actor.organization_id
          and g.is_active
      )
    ) then
      raise exception 'One or more plan work groups are invalid or inactive';
    end if;

    foreach v_group_id in array v_program.assigned_group_ids
    loop
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
      where m.group_id=v_group_id and m.is_active;

      insert into public.work_group_assignment_snapshots(
        organization_id,group_id,target_record_id,assignment_role,member_snapshot,created_by
      )
      values(
        v_actor.organization_id,v_group_id,v_record.id,'PLAN_EXECUTION',v_group_snapshot,p_actor_user_id
      )
      on conflict (group_id,target_record_id,assignment_role) do nothing;
    end loop;
  end if;

  for v_task in select value from jsonb_array_elements(v_program.draft_actions)
  loop
    v_client_id:=coalesce(nullif(trim(v_task->>'client_id'),''),'task-'||(v_count+1)::text);
    v_title:=trim(coalesce(v_task->>'title',''));
    if v_title='' then raise exception 'Task title is required'; end if;

    v_lead_department_id:=null;
    if nullif(trim(coalesce(v_task->>'lead_department_id','')),'') is not null then
      begin
        v_lead_department_id:=(v_task->>'lead_department_id')::uuid;
      exception when others then
        raise exception 'Task lead department is invalid';
      end;
    end if;
    v_execution_scope:=upper(coalesce(nullif(trim(v_task->>'execution_scope'),''),'LEAD_DEPARTMENT'));
    if v_execution_scope not in ('LEAD_DEPARTMENT','SELECTED_DEPARTMENTS','ALL_DEPARTMENTS') then
      raise exception 'Task execution scope is invalid';
    end if;
    begin
      select coalesce(array_agg(value::uuid),'{}'::uuid[])
      into v_execution_department_ids
      from jsonb_array_elements_text(coalesce(v_task->'execution_department_ids','[]'::jsonb));
    exception when others then
      raise exception 'Task execution departments contain invalid ids';
    end;
    v_assignment_target_type:=upper(coalesce(
      nullif(trim(v_task->>'assignment_target_type'),''),
      case when nullif(trim(coalesce(v_task->>'assignee_group_id','')),'') is not null then 'GROUP' else 'USER' end
    ));
    if v_assignment_target_type not in ('DEPARTMENT','USER','GROUP') then
      raise exception 'Task assignment target type is invalid';
    end if;
    v_assignee_user_id:=null;
    v_assignee_group_id:=null;
    v_operational_owner_user_id:=null;
    if v_assignment_target_type='USER' then
      begin
        v_assignee_user_id:=(v_task->>'assignee_user_id')::uuid;
      exception when others then
        raise exception 'Task user assignee is invalid';
      end;
    elsif v_assignment_target_type='GROUP' then
      begin
        v_assignee_group_id:=(v_task->>'assignee_group_id')::uuid;
      exception when others then
        raise exception 'Task group assignee is invalid';
      end;
    end if;

    v_start_date:=nullif(v_task->>'start_date','')::date;
    v_due_date:=nullif(v_task->>'due_date','')::date;
    if v_due_date is null then raise exception 'Task due date is required'; end if;
    if v_start_date is not null and v_due_date<v_start_date then
      raise exception 'Task due date cannot be before start date';
    end if;

    v_priority:=upper(coalesce(nullif(trim(v_task->>'priority'),''),'NORMAL'));
    if v_priority not in ('LOW','NORMAL','HIGH','URGENT','CRITICAL') then
      raise exception 'Task priority is invalid';
    end if;

    v_expected_result:=trim(coalesce(v_task->>'expected_result',''));
    if v_expected_result='' then raise exception 'Task expected result is required'; end if;
    v_verification_requirement:=nullif(trim(coalesce(v_task->>'verification_requirement','')),'');
    v_description:=nullif(trim(coalesce(v_task->>'description','')),'');
    v_milestone_group:=nullif(trim(coalesce(v_task->>'milestone_group','')),'');
    v_is_required:=coalesce((v_task->>'is_required')::boolean,true);
    v_criteria_refs:=coalesce(v_task->'criteria_refs','[]'::jsonb);
    if jsonb_typeof(v_criteria_refs)<>'array' then
      raise exception 'Task criteria refs must be an array';
    end if;

    begin
      select coalesce(array_agg(value::uuid),'{}'::uuid[])
      into v_collaborating_department_ids
      from jsonb_array_elements_text(coalesce(v_task->'collaborating_department_ids','[]'::jsonb));
    exception when others then
      raise exception 'Task collaborating departments contain invalid ids';
    end;
    begin
      select coalesce(array_agg(value::uuid),'{}'::uuid[])
      into v_collaborating_user_ids
      from jsonb_array_elements_text(coalesce(v_task->'collaborating_user_ids','[]'::jsonb));
    exception when others then
      raise exception 'Task collaborating users contain invalid ids';
    end;
    begin
      select coalesce(array_agg(value::uuid),'{}'::uuid[])
      into v_collaborating_group_ids
      from jsonb_array_elements_text(coalesce(v_task->'collaborating_group_ids','[]'::jsonb));
    exception when others then
      raise exception 'Task collaborating groups contain invalid ids';
    end;
    v_parent_client_id:=nullif(trim(coalesce(v_task->>'parent_client_id','')),'');

    if v_execution_scope='LEAD_DEPARTMENT' and v_lead_department_id is null then
      raise exception 'Task lead department is required';
    end if;
    if v_lead_department_id is not null and not exists(
      select 1 from public.departments d
      where d.id=v_lead_department_id
        and d.organization_id=v_actor.organization_id
        and d.is_active
    ) then
      raise exception 'Task lead department is invalid or outside organization';
    end if;
    if v_execution_scope='SELECTED_DEPARTMENTS' and cardinality(v_execution_department_ids)=0 then
      raise exception 'Task selected execution departments are required';
    end if;
    if cardinality(v_execution_department_ids)>0 and exists(
      select 1 from unnest(v_execution_department_ids) x
      where not exists(
        select 1 from public.departments d
        where d.id=x and d.organization_id=v_actor.organization_id and d.is_active
      )
    ) then
      raise exception 'One or more execution departments are invalid';
    end if;

    if v_assignment_target_type='USER' then
      if not exists(
        select 1 from public.profiles p
        where p.user_id=v_assignee_user_id
          and p.organization_id=v_actor.organization_id
          and p.is_active
      ) then
        raise exception 'Task user assignee is invalid or outside organization';
      end if;
      v_operational_owner_user_id:=v_assignee_user_id;
    elsif v_assignment_target_type='GROUP' then
      if not exists(
        select 1 from public.work_groups g
        where g.id=v_assignee_group_id
          and g.organization_id=v_actor.organization_id
          and g.is_active
      ) then
        raise exception 'Task group assignee is invalid or inactive';
      end if;

      select coalesce(
        (
          select p.user_id
          from public.work_groups g
          join public.profiles p on p.user_id=g.leader_user_id
          where g.id=v_assignee_group_id
            and p.organization_id=v_actor.organization_id
            and p.is_active
          limit 1
        ),
        (
          select m.user_id
          from public.work_group_members m
          join public.profiles p on p.user_id=m.user_id
          where m.group_id=v_assignee_group_id
            and m.is_active
            and p.organization_id=v_actor.organization_id
            and p.is_active
          order by case m.member_role when 'LEADER' then 1 when 'DEPUTY' then 2 when 'SECRETARY' then 3 else 4 end,
                   m.created_at
          limit 1
        )
      ) into v_operational_owner_user_id;

      if v_operational_owner_user_id is null then
        raise exception 'Task group assignee has no active members';
      end if;

      v_collaborating_group_ids:=array_remove(v_collaborating_group_ids,v_assignee_group_id);
    end if;

    if cardinality(v_collaborating_department_ids)>0 and exists(
      select 1 from unnest(v_collaborating_department_ids) x
      where not exists(
        select 1 from public.departments d
        where d.id=x
          and d.organization_id=v_actor.organization_id
          and d.is_active
      )
    ) then
      raise exception 'One or more collaborating departments are invalid';
    end if;
    if cardinality(v_collaborating_user_ids)>0 and exists(
      select 1 from unnest(v_collaborating_user_ids) x
      where not exists(
        select 1 from public.profiles p
        where p.user_id=x
          and p.organization_id=v_actor.organization_id
          and p.is_active
      )
    ) then
      raise exception 'One or more collaborating users are invalid';
    end if;

    if cardinality(v_collaborating_group_ids)>0 and exists(
      select 1 from unnest(v_collaborating_group_ids) gid
      where not exists(
        select 1 from public.work_groups g
        where g.id=gid
          and g.organization_id=v_actor.organization_id
          and g.is_active
      )
    ) then
      raise exception 'One or more collaborating work groups are invalid or inactive';
    end if;

    if cardinality(v_collaborating_group_ids)>0 then
      select coalesce(array_agg(distinct q.user_id),'{}'::uuid[])
      into v_collaborating_user_ids
      from (
        select u as user_id from unnest(v_collaborating_user_ids) u
        union
        select m.user_id
        from public.work_group_members m
        join public.work_groups g on g.id=m.group_id
        where m.group_id=any(v_collaborating_group_ids)
          and m.is_active
          and g.organization_id=v_actor.organization_id
          and g.is_active
      ) q
      where q.user_id is not null;
    end if;

    v_automation_outputs:=coalesce(v_task->'automation_outputs','[]'::jsonb);
    if jsonb_typeof(v_automation_outputs)<>'array' then
      raise exception 'Task automation outputs must be an array';
    end if;

    if jsonb_array_length(v_automation_outputs)=0
       and coalesce((v_task->>'automation_confirmed')::boolean,false)
       and upper(coalesce(nullif(trim(v_task->>'automation_kind'),''),'ACTION'))<>'ACTION' then
      v_automation_outputs:=jsonb_build_array(
        jsonb_build_object(
          'kind',upper(coalesce(nullif(trim(v_task->>'automation_kind'),''),'ACTION')),
          'ref_id',nullif(trim(coalesce(v_task->>'automation_ref_id','')),''),
          'target_department_id',nullif(trim(coalesce(v_task->>'automation_target_department_id','')),''),
          'target_area',nullif(trim(coalesce(v_task->>'automation_target_area','')),''),
          'report_recipient',nullif(trim(coalesce(v_task->>'automation_report_recipient','')),''),
          'report_method',nullif(trim(coalesce(v_task->>'automation_report_method','')),''),
          'report_period',nullif(trim(coalesce(v_task->>'automation_report_period','')),''),
          'report_recurrence_rule',nullif(trim(coalesce(v_task->>'automation_report_recurrence_rule','')),''),
          'report_recurrence_end_date',nullif(trim(coalesce(v_task->>'automation_report_recurrence_end_date','')),''),
          'assessment_round_type',nullif(trim(coalesce(v_task->>'automation_assessment_round_type','')),''),
          'audit_type',nullif(trim(coalesce(v_task->>'automation_audit_type','')),'')
        )
      );
    end if;

    if exists(
      select 1
      from jsonb_array_elements(v_automation_outputs) o
      where upper(coalesce(nullif(trim(o->>'kind'),''),'INVALID'))
            not in ('INDICATOR','MONITORING','REPORT','ASSESSMENT','AUDIT','IMPROVEMENT')
    ) then
      raise exception 'Task contains invalid automation output kind';
    end if;

    if (
      select count(*) from jsonb_array_elements(v_automation_outputs)
    ) <> (
      select count(distinct upper(trim(o->>'kind'))) from jsonb_array_elements(v_automation_outputs) o
    ) then
      raise exception 'Task automation output kinds must be unique';
    end if;

    select public.next_record_code(v_actor.organization_id,'ACTION',v_record.work_year) into v_record_code;
    insert into public.records(
      organization_id,record_type,record_code,title,work_year,
      owner_department_id,owner_user_id,lifecycle_status,created_by,metadata
    )
    values(
      v_actor.organization_id,'ACTION',v_record_code,v_title,v_record.work_year,
      v_lead_department_id,v_operational_owner_user_id,'ACTIVE',p_actor_user_id,
      jsonb_build_object(
        'origin','PLAN_AUTOMATION',
        'program_id',p_program_id,
        'plan_task_client_id',v_client_id,
        'automation_outputs',v_automation_outputs,
        'parent_client_id',v_parent_client_id
      )
    )
    returning id into v_action_record_id;

    insert into public.actions(
      record_id,title,description,priority,lead_department_id,assignment_target_type,assignee_user_id,assignee_group_id,
      start_date,due_date,expected_result,verification_requirement,workflow_status,
      criteria_refs,collaborating_department_ids,collaborating_user_ids,collaborating_group_ids
    )
    values(
      v_action_record_id,v_title,v_description,v_priority,v_lead_department_id,v_assignment_target_type,v_assignee_user_id,v_assignee_group_id,
      v_start_date,v_due_date,v_expected_result,v_verification_requirement,'NOT_STARTED',
      v_criteria_refs,v_collaborating_department_ids,v_collaborating_user_ids,v_collaborating_group_ids
    )
    returning id into v_action_id;

    if v_execution_scope='ALL_DEPARTMENTS' then
      insert into public.action_department_executions(action_id,department_id,due_date)
      select v_action_id,d.id,v_due_date
      from public.departments d
      where d.organization_id=v_actor.organization_id
        and d.is_active
        and d.is_operational_unit
      on conflict (action_id,department_id) do nothing;
    elsif v_execution_scope='SELECTED_DEPARTMENTS' then
      insert into public.action_department_executions(action_id,department_id,due_date)
      select v_action_id,x,v_due_date
      from unnest(v_execution_department_ids) x
      on conflict (action_id,department_id) do nothing;
    end if;

    insert into public.program_action_links(
      program_id,action_id,relation_type,milestone_group,is_required,sequence_no
    )
    values(
      p_program_id,v_action_id,'DELIVERS',v_milestone_group,v_is_required,v_count+1
    );

    insert into public.record_links(
      source_record_id,target_record_id,relation_type,metadata,created_by
    )
    values(
      v_record.id,v_action_record_id,'HAS_ACTION',
      jsonb_build_object(
        'source_record_type','PROGRAM',
        'source_record_code',v_record.record_code,
        'program_id',p_program_id,
        'plan_task_client_id',v_client_id,
        'criteria_refs',v_criteria_refs,
        'automation_outputs',v_automation_outputs,
        'parent_client_id',v_parent_client_id
      ),
      p_actor_user_id
    );

    if v_assignment_target_type='USER' then
      insert into public.notifications(
        recipient_user_id,notification_type,priority,title,message,target_record_id,target_route,
        notification_event_key,is_read
      )
      values(
        v_assignee_user_id,'ACTION_ASSIGNED',v_priority,'Bạn được giao công việc mới',
        v_title,v_action_record_id,'/tasks/'||v_action_record_id::text,
        'action-assigned:'||v_action_id::text||':'||v_assignee_user_id::text,false
      );
    elsif v_assignment_target_type='GROUP' then
      insert into public.notifications(
        recipient_user_id,notification_type,priority,title,message,target_record_id,target_route,
        notification_event_key,is_read
      )
      select
        m.user_id,'ACTION_GROUP_ASSIGNED',v_priority,'Nhóm của bạn được giao công việc mới',
        v_title,v_action_record_id,'/tasks/'||v_action_record_id::text,
        'action-group-assigned:'||v_action_id::text||':'||m.user_id::text,false
      from public.work_group_members m
      join public.profiles p on p.user_id=m.user_id
      where m.group_id=v_assignee_group_id
        and m.is_active
        and p.organization_id=v_actor.organization_id
        and p.is_active;

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
        and p.organization_id=v_actor.organization_id
        and p.is_active;

      insert into public.work_group_assignment_snapshots(
        organization_id,group_id,target_record_id,assignment_role,member_snapshot,created_by
      )
      values(
        v_actor.organization_id,v_assignee_group_id,v_action_record_id,'ACTION_ASSIGNEE_GROUP',v_group_snapshot,p_actor_user_id
      )
      on conflict (group_id,target_record_id,assignment_role) do nothing;
    end if;

    insert into public.notifications(
      recipient_user_id,notification_type,priority,title,message,target_record_id,target_route,
      notification_event_key,is_read
    )
    select
      u,'ACTION_COLLABORATOR',v_priority,'Bạn được phân công phối hợp',
      v_title,v_action_record_id,'/tasks/'||v_action_record_id::text,
      'action-collaborator:'||v_action_id::text||':'||u::text,false
    from unnest(v_collaborating_user_ids) u
    where (v_assignee_user_id is null or u<>v_assignee_user_id)
      and (
        v_assignee_group_id is null
        or not exists(
          select 1 from public.work_group_members pm
          where pm.group_id=v_assignee_group_id and pm.user_id=u and pm.is_active
        )
      );

    if cardinality(v_collaborating_group_ids)>0 then
      foreach v_group_id in array v_collaborating_group_ids
      loop
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
        where m.group_id=v_group_id and m.is_active;

        insert into public.work_group_assignment_snapshots(
          organization_id,group_id,target_record_id,assignment_role,member_snapshot,created_by
        )
        values(
          v_actor.organization_id,v_group_id,v_action_record_id,'ACTION_COLLABORATOR',v_group_snapshot,p_actor_user_id
        )
        on conflict (group_id,target_record_id,assignment_role) do nothing;
      end loop;
    end if;

    for v_output in select value from jsonb_array_elements(v_automation_outputs)
    loop
      v_automation_confirmed:=true;
      v_automation_kind:=upper(trim(v_output->>'kind'));
      v_automation_ref_id:=null;
      v_automation_target_department_id:=null;
      v_automation_target_area:=null;
      v_monitoring_recurrence:=upper(coalesce(nullif(trim(v_output->>'monitoring_recurrence'),''),'ONCE'));
      v_monitoring_recurrence_end_date:=nullif(v_output->>'monitoring_recurrence_end_date','')::date;
      v_monitoring_recurrence_rule:=null;
      v_monitoring_schedule_end:=null;
      if v_monitoring_recurrence not in ('ONCE','DAILY','WEEKLY','MONTHLY','QUARTERLY','YEARLY') then
        raise exception 'Monitoring recurrence is invalid';
      end if;
      v_report_recipient:=nullif(trim(coalesce(v_output->>'report_recipient','')),'');
      v_report_method:=nullif(trim(coalesce(v_output->>'report_method','')),'');
      v_report_period:=nullif(trim(coalesce(v_output->>'report_period','')),'');
      v_report_recurrence_rule:=upper(nullif(trim(coalesce(v_output->>'report_recurrence_rule','')),''));
      v_report_recurrence_end_date:=nullif(v_output->>'report_recurrence_end_date','')::date;
      v_assessment_round_type:=nullif(trim(coalesce(v_output->>'assessment_round_type','')),'');
      v_audit_type:=nullif(trim(coalesce(v_output->>'audit_type','')),'');

      if v_automation_kind in ('INDICATOR','MONITORING','ASSESSMENT') then
        begin
          v_automation_ref_id:=(v_output->>'ref_id')::uuid;
        exception when others then
          raise exception 'Automation reference is required and must be valid';
        end;
      end if;

      if v_automation_kind='MONITORING' then
        v_automation_target_area:=nullif(trim(coalesce(v_output->>'target_area','')),'');
        if nullif(trim(coalesce(v_output->>'target_department_id','')),'') is not null then
          begin
            v_automation_target_department_id:=(v_output->>'target_department_id')::uuid;
          exception when others then
            raise exception 'Monitoring target department is invalid';
          end;
          if not exists(
            select 1 from public.departments d
            where d.id=v_automation_target_department_id
              and d.organization_id=v_actor.organization_id
              and d.is_active
          ) then
            raise exception 'Monitoring target department is invalid or outside organization';
          end if;
        end if;
        if v_automation_target_department_id is null and v_automation_target_area is null then
          raise exception 'Monitoring target department or area is required';
        end if;
      end if;

      if v_automation_kind='REPORT' then
        if v_report_recipient is null then raise exception 'Report recipient is required'; end if;
        if v_report_method is null then raise exception 'Report submission method is required'; end if;
        if v_report_period is null then raise exception 'Report period is required'; end if;
        if v_report_recurrence_rule is not null and v_report_recurrence_rule not in ('MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL') then
          raise exception 'Report recurrence is invalid';
        end if;
        if v_report_recurrence_end_date is not null and v_report_recurrence_end_date<v_due_date then
          raise exception 'Report recurrence end cannot be before first due date';
        end if;
      end if;

      if v_automation_kind='AUDIT' and v_audit_type is null then
        raise exception 'Audit type is required';
      end if;

      if v_automation_kind='INDICATOR' then
      select * into v_indicator_assignment
      from public.indicator_assignments
      where id=v_automation_ref_id;

      if not found or v_indicator_assignment.status<>'ACTIVE' then
        raise exception 'Selected indicator assignment is invalid or inactive';
      end if;
      if v_indicator_assignment.work_year<>v_record.work_year then
        raise exception 'Selected indicator assignment is outside plan work year';
      end if;
      if v_indicator_assignment.department_id is not null and not exists(
        select 1 from public.departments d
        where d.id=v_indicator_assignment.department_id
          and d.organization_id=v_actor.organization_id
          and d.is_active
      ) then
        raise exception 'Selected indicator assignment is outside organization';
      end if;
      if v_indicator_assignment.collector_user_id is not null and not exists(
        select 1 from public.profiles p
        where p.user_id=v_indicator_assignment.collector_user_id
          and p.organization_id=v_actor.organization_id
          and p.is_active
      ) then
        raise exception 'Selected indicator collector is invalid or outside organization';
      end if;

      v_period_start:=coalesce(v_start_date,v_program.start_date,v_due_date);
      if v_period_start is null then v_period_start:=v_due_date; end if;
      v_output_owner_department_id:=coalesce(v_indicator_assignment.department_id,v_lead_department_id);
      v_output_owner_user_id:=coalesce(v_indicator_assignment.collector_user_id,v_operational_owner_user_id);

      select public.next_record_code(v_actor.organization_id,'INDICATOR_MEASUREMENT',v_record.work_year) into v_output_code;
      insert into public.records(
        organization_id,record_type,record_code,title,work_year,
        owner_department_id,owner_user_id,lifecycle_status,created_by,metadata
      )
      values(
        v_actor.organization_id,'INDICATOR_MEASUREMENT',v_output_code,
        v_title||' · kỳ đo',v_record.work_year,
        v_output_owner_department_id,v_output_owner_user_id,'ACTIVE',p_actor_user_id,
        jsonb_build_object(
          'origin','PLAN_AUTOMATION',
          'program_id',p_program_id,
          'plan_task_client_id',v_client_id,
          'source_action_record_id',v_action_record_id,
          'indicator_assignment_id',v_indicator_assignment.id
        )
      )
      returning id into v_output_record_id;

      insert into public.indicator_measurements(
        record_id,indicator_assignment_id,period_start,period_end,
        source_mode,workflow_status
      )
      values(
        v_output_record_id,v_indicator_assignment.id,v_period_start,v_due_date,
        'PLAN_AUTO','DRAFT'
      )
      returning id into v_output_domain_id;

      insert into public.record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
      values
        (v_record.id,v_output_record_id,'HAS_OUTPUT',
          jsonb_build_object('automation_kind','INDICATOR','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id),
        (v_action_record_id,v_output_record_id,'MATERIALIZES',
          jsonb_build_object('automation_kind','INDICATOR','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id);

      v_indicator_count:=v_indicator_count+1;
      end if;

      if v_automation_kind='MONITORING' then
      select * into v_checklist_version
      from public.checklist_versions
      where id=v_automation_ref_id;
      if not found or v_checklist_version.status<>'PUBLISHED' then
        raise exception 'Selected checklist version is invalid or not published';
      end if;

      select * into v_checklist_template
      from public.checklist_templates
      where id=v_checklist_version.checklist_template_id;
      if not found or not v_checklist_template.is_active then
        raise exception 'Selected checklist template is inactive';
      end if;
      if v_checklist_template.organization_id is not null
         and v_checklist_template.organization_id<>v_actor.organization_id then
        raise exception 'Selected checklist is outside organization';
      end if;

      select public.next_record_code(v_actor.organization_id,'MONITORING',v_record.work_year) into v_output_code;
      insert into public.records(
        organization_id,record_type,record_code,title,work_year,
        owner_department_id,owner_user_id,lifecycle_status,created_by,metadata
      )
      values(
        v_actor.organization_id,'MONITORING',v_output_code,
        v_title||' · '||v_due_date::text,v_record.work_year,
        v_lead_department_id,v_operational_owner_user_id,'ACTIVE',p_actor_user_id,
        jsonb_build_object(
          'origin','PLAN_AUTOMATION',
          'program_id',p_program_id,
          'plan_task_client_id',v_client_id,
          'source_action_record_id',v_action_record_id,
          'checklist_version_id',v_checklist_version.id,
          'target_department_id',v_automation_target_department_id,
          'target_area',v_automation_target_area
        )
      )
      returning id into v_output_record_id;

      insert into public.monitoring_rounds(
        record_id,checklist_version_id,work_year,scheduled_date,
        target_department_id,target_area,lead_assessor_id,workflow_status
      )
      values(
        v_output_record_id,v_checklist_version.id,v_record.work_year,v_due_date,
        v_automation_target_department_id,v_automation_target_area,v_operational_owner_user_id,'SCHEDULED'
      )
      returning id into v_output_domain_id;

      insert into public.monitoring_assignments(
        monitoring_round_id,user_id,assignment_role
      )
      select v_output_domain_id,m.user_id,
        case when m.user_id=v_operational_owner_user_id then 'LEAD_ASSESSOR' else 'ASSESSOR' end
      from public.work_group_members m
      join public.profiles p on p.user_id=m.user_id
      where v_assignment_target_type='GROUP'
        and m.group_id=v_assignee_group_id
        and m.is_active
        and p.organization_id=v_actor.organization_id
        and p.is_active
      union all
      select v_output_domain_id,v_assignee_user_id,'LEAD_ASSESSOR'
      where v_assignment_target_type='USER';

      insert into public.record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
      values
        (v_record.id,v_output_record_id,'HAS_OUTPUT',
          jsonb_build_object('automation_kind','MONITORING','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id),
        (v_action_record_id,v_output_record_id,'MATERIALIZES',
          jsonb_build_object('automation_kind','MONITORING','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id);

      v_monitoring_count:=v_monitoring_count+1;

      if v_monitoring_recurrence<>'ONCE' then
        if v_verification_requirement is null then
          raise exception 'Recurring monitoring requires verification/evidence requirement';
        end if;

        v_monitoring_schedule_end:=coalesce(v_monitoring_recurrence_end_date,v_program.end_date);
        if v_monitoring_schedule_end is null then
          raise exception 'Recurring monitoring requires an end date or plan end date';
        end if;
        if v_monitoring_schedule_end<v_due_date then
          raise exception 'Recurring monitoring end date cannot be before first monitoring date';
        end if;

        v_monitoring_recurrence_rule:=case v_monitoring_recurrence
          when 'DAILY' then 'FREQ=DAILY;INTERVAL=1'
          when 'WEEKLY' then 'FREQ=WEEKLY;INTERVAL=1;BYDAY='||
            case extract(dow from v_due_date)::int
              when 0 then 'SU' when 1 then 'MO' when 2 then 'TU' when 3 then 'WE'
              when 4 then 'TH' when 5 then 'FR' else 'SA'
            end
          when 'MONTHLY' then 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY='||extract(day from v_due_date)::int::text
          when 'QUARTERLY' then 'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY='||extract(day from v_due_date)::int::text
          when 'YEARLY' then 'FREQ=YEARLY;INTERVAL=1;BYMONTH='||extract(month from v_due_date)::int::text||
            ';BYMONTHDAY='||extract(day from v_due_date)::int::text
          else null
        end;

        insert into public.recurring_work_templates(
          organization_id,title,description,recurrence_rule,start_date,end_date,due_offset_days,
          lead_department_id,assignment_target_type,assignee_user_id,assignee_group_id,priority,expected_result,evidence_requirement,is_active,
          source_code,source_label,source_criteria,automation_kind,automation_ref_id,
          automation_target_department_id,automation_target_area,created_by
        )
        values(
          v_actor.organization_id,v_title,v_description,v_monitoring_recurrence_rule,v_due_date,v_monitoring_schedule_end,0,
          v_lead_department_id,v_assignment_target_type,v_assignee_user_id,v_assignee_group_id,v_priority,v_expected_result,v_verification_requirement,true,
          'PLAN-MON-'||substr(md5(p_program_id::text||':'||v_client_id),1,24),
          coalesce(v_record.record_code,'PLAN')||' · Nhiệm vụ kế hoạch',
          v_criteria_refs,'MONITORING',v_checklist_version.id,
          v_automation_target_department_id,v_automation_target_area,p_actor_user_id
        )
        returning id into v_recurring_template_id;

        insert into public.recurring_work_runs(
          template_id,period_key,planned_date,generated_action_id,generated_output_record_id,generated_at,status
        )
        values(
          v_recurring_template_id,v_due_date::text,v_due_date,v_action_id,v_output_record_id,now(),'GENERATED'
        );

        v_recurring_template_ids:=v_recurring_template_ids||jsonb_build_array(v_recurring_template_id::text);
        v_recurring_monitoring_count:=v_recurring_monitoring_count+1;
      end if;
      end if;


      if v_automation_kind='REPORT' then
      select public.next_record_code(v_actor.organization_id,'REPORT',v_record.work_year) into v_output_code;
      insert into public.records(
        organization_id,record_type,record_code,title,work_year,
        owner_department_id,owner_user_id,lifecycle_status,created_by,metadata
      )
      values(
        v_actor.organization_id,'REPORT',v_output_code,v_title,v_record.work_year,
        v_lead_department_id,v_operational_owner_user_id,'ACTIVE',p_actor_user_id,
        jsonb_build_object(
          'origin','PLAN_AUTOMATION',
          'program_id',p_program_id,
          'plan_task_client_id',v_client_id,
          'source_action_record_id',v_action_record_id,
          'automation_kind','REPORT'
        )
      )
      returning id into v_output_record_id;

      insert into public.reporting_obligations(
        record_id,report_type,reporting_period,due_date,
        preparing_department_id,preparer_user_id,recipient_name,submission_method,
        notes,workflow_status,recurrence_rule,recurrence_end_date
      )
      values(
        v_output_record_id,'PLAN_OUTPUT',v_report_period,v_due_date,
        v_lead_department_id,v_operational_owner_user_id,v_report_recipient,v_report_method,
        v_expected_result,'NOT_DUE',
        case v_report_recurrence_rule
          when 'MONTHLY' then 'FREQ=MONTHLY'
          when 'QUARTERLY' then 'FREQ=MONTHLY;INTERVAL=3'
          when 'SEMIANNUAL' then 'FREQ=MONTHLY;INTERVAL=6'
          when 'ANNUAL' then 'FREQ=YEARLY'
          else null
        end,
        v_report_recurrence_end_date
      )
      returning id into v_output_domain_id;

      insert into public.record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
      values
        (v_record.id,v_output_record_id,'HAS_OUTPUT',
          jsonb_build_object('automation_kind','REPORT','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id),
        (v_action_record_id,v_output_record_id,'MATERIALIZES',
          jsonb_build_object('automation_kind','REPORT','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id),
        (v_output_record_id,v_action_record_id,'HAS_ACTION',
          jsonb_build_object('origin','PLAN_AUTOMATION','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id);

      v_report_count:=v_report_count+1;
      end if;

      if v_automation_kind='ASSESSMENT' then
      select * into v_criteria_version
      from public.criteria_set_versions
      where id=v_automation_ref_id;
      if not found or v_criteria_version.status<>'PUBLISHED' then
        raise exception 'Selected criteria version is invalid or not published';
      end if;

      select * into v_criteria_set
      from public.criteria_sets
      where id=v_criteria_version.criteria_set_id;
      if not found or (v_criteria_set.organization_id is not null and v_criteria_set.organization_id<>v_actor.organization_id) then
        raise exception 'Selected criteria set is outside organization';
      end if;

      select public.next_record_code(v_actor.organization_id,'ASSESSMENT',v_record.work_year) into v_output_code;
      insert into public.records(
        organization_id,record_type,record_code,title,work_year,
        owner_department_id,owner_user_id,lifecycle_status,created_by,metadata
      )
      values(
        v_actor.organization_id,'ASSESSMENT',v_output_code,v_title,v_record.work_year,
        v_lead_department_id,v_operational_owner_user_id,'ACTIVE',p_actor_user_id,
        jsonb_build_object(
          'origin','PLAN_AUTOMATION',
          'program_id',p_program_id,
          'plan_task_client_id',v_client_id,
          'source_action_record_id',v_action_record_id,
          'criteria_version_id',v_criteria_version.id
        )
      )
      returning id into v_output_record_id;

      insert into public.assessment_rounds(
        record_id,criteria_version_id,round_type,start_date,submission_deadline,
        work_year,workflow_status
      )
      values(
        v_output_record_id,v_criteria_version.id,coalesce(v_assessment_round_type,'PLAN'),
        coalesce(v_start_date,v_program.start_date),v_due_date,v_record.work_year,'DRAFT'
      )
      returning id into v_output_domain_id;

      insert into public.assessment_round_criteria(assessment_round_id,criterion_id,is_required)
      select v_output_domain_id,ci.id,true
      from public.criteria_items ci
      where ci.criteria_version_id=v_criteria_version.id
        and coalesce(ci.is_active,true);

      insert into public.record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
      values
        (v_record.id,v_output_record_id,'HAS_OUTPUT',
          jsonb_build_object('automation_kind','ASSESSMENT','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id),
        (v_action_record_id,v_output_record_id,'MATERIALIZES',
          jsonb_build_object('automation_kind','ASSESSMENT','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id),
        (v_output_record_id,v_action_record_id,'HAS_ACTION',
          jsonb_build_object('origin','PLAN_AUTOMATION','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id);

      v_assessment_count:=v_assessment_count+1;
      end if;

      if v_automation_kind='AUDIT' then
      select public.next_record_code(v_actor.organization_id,'AUDIT',v_record.work_year) into v_output_code;
      insert into public.records(
        organization_id,record_type,record_code,title,work_year,
        owner_department_id,owner_user_id,lifecycle_status,created_by,metadata
      )
      values(
        v_actor.organization_id,'AUDIT',v_output_code,v_title,v_record.work_year,
        v_lead_department_id,v_operational_owner_user_id,'ACTIVE',p_actor_user_id,
        jsonb_build_object(
          'origin','PLAN_AUTOMATION',
          'program_id',p_program_id,
          'plan_task_client_id',v_client_id,
          'source_action_record_id',v_action_record_id,
          'automation_kind','AUDIT'
        )
      )
      returning id into v_output_record_id;

      insert into public.audits(
        record_id,audit_type,objective,start_date,end_date,lead_auditor_id,work_year,workflow_status
      )
      values(
        v_output_record_id,v_audit_type,v_expected_result,
        coalesce(v_start_date,v_program.start_date),v_due_date,v_operational_owner_user_id,
        v_record.work_year,'DRAFT'
      )
      returning id into v_output_domain_id;

      insert into public.record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
      values
        (v_record.id,v_output_record_id,'HAS_OUTPUT',
          jsonb_build_object('automation_kind','AUDIT','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id),
        (v_action_record_id,v_output_record_id,'MATERIALIZES',
          jsonb_build_object('automation_kind','AUDIT','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id),
        (v_output_record_id,v_action_record_id,'HAS_ACTION',
          jsonb_build_object('origin','PLAN_AUTOMATION','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id);

      v_audit_count:=v_audit_count+1;
      end if;

      if v_automation_kind='IMPROVEMENT' then
      select public.next_record_code(v_actor.organization_id,'IMPROVEMENT_PROJECT',v_record.work_year) into v_output_code;
      insert into public.records(
        organization_id,record_type,record_code,title,work_year,
        owner_department_id,owner_user_id,lifecycle_status,created_by,metadata
      )
      values(
        v_actor.organization_id,'IMPROVEMENT_PROJECT',v_output_code,v_title,v_record.work_year,
        v_lead_department_id,v_operational_owner_user_id,'ACTIVE',p_actor_user_id,
        jsonb_build_object(
          'origin','PLAN_AUTOMATION',
          'program_id',p_program_id,
          'plan_task_client_id',v_client_id,
          'source_action_record_id',v_action_record_id,
          'automation_kind','IMPROVEMENT'
        )
      )
      returning id into v_output_record_id;

      insert into public.improvement_projects(
        record_id,work_year,title,lead_department_id,project_leader_user_id,
        start_date,target_end_date,workflow_status
      )
      values(
        v_output_record_id,v_record.work_year,v_title,v_lead_department_id,v_assignee_user_id,
        coalesce(v_start_date,v_program.start_date),v_due_date,'DRAFT'
      )
      returning id into v_output_domain_id;

      insert into public.record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
      values
        (v_record.id,v_output_record_id,'HAS_OUTPUT',
          jsonb_build_object('automation_kind','IMPROVEMENT','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id),
        (v_action_record_id,v_output_record_id,'MATERIALIZES',
          jsonb_build_object('automation_kind','IMPROVEMENT','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id),
        (v_output_record_id,v_action_record_id,'HAS_ACTION',
          jsonb_build_object('origin','PLAN_AUTOMATION','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id);

      v_improvement_count:=v_improvement_count+1;
      end if;
    end loop;

    v_count:=v_count+1;
  end loop;

  for v_task in select value from jsonb_array_elements(v_program.draft_actions)
  loop
    v_client_id:=coalesce(nullif(trim(v_task->>'client_id'),''),'');
    v_parent_client_id:=nullif(trim(coalesce(v_task->>'parent_client_id','')),'');
    if v_parent_client_id is not null then
      if v_parent_client_id=v_client_id then
        raise exception 'A task cannot be its own parent';
      end if;

      select a.id into v_action_id
      from public.actions a
      join public.records r on r.id=a.record_id
      where r.organization_id=v_actor.organization_id
        and r.metadata->>'origin'='PLAN_AUTOMATION'
        and r.metadata->>'program_id'=p_program_id::text
        and r.metadata->>'plan_task_client_id'=v_client_id
      limit 1;

      select a.id into v_parent_action_id
      from public.actions a
      join public.records r on r.id=a.record_id
      where r.organization_id=v_actor.organization_id
        and r.metadata->>'origin'='PLAN_AUTOMATION'
        and r.metadata->>'program_id'=p_program_id::text
        and r.metadata->>'plan_task_client_id'=v_parent_client_id
      limit 1;

      if v_action_id is null or v_parent_action_id is null then
        raise exception 'Task hierarchy references an unknown parent';
      end if;

      update public.actions
      set parent_action_id=v_parent_action_id
      where id=v_action_id;
    end if;
  end loop;

  update public.work_programs
  set workflow_status='APPROVED',
      approved_by=p_actor_user_id,
      approved_at=now(),
      returned_reason=null
  where id=p_program_id and workflow_status='PENDING_APPROVAL';

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,new_value,request_meta
  )
  values(
    p_actor_user_id,v_record.id,'work_programs',p_program_id,'APPROVE_PLAN_BUNDLE_V10',
    jsonb_build_object(
      'program_id',p_program_id,
      'materialized_actions',v_count,
      'indicator_measurements',v_indicator_count,
      'monitoring_rounds',v_monitoring_count,
      'reporting_obligations',v_report_count,
      'assessment_rounds',v_assessment_count,
      'audits',v_audit_count,
      'improvement_projects',v_improvement_count,
      'recurring_monitoring_templates',v_recurring_monitoring_count,
      'revision_no',v_program.revision_no
    ),
    jsonb_build_object('source','qlcl-ui','transaction','atomic','automation','v7_assignment_target','work_groups','snapshot')
  );

  return jsonb_build_object(
    'ok',true,
    'program_id',p_program_id,
    'materialized_actions',v_count,
    'indicator_measurements',v_indicator_count,
    'monitoring_rounds',v_monitoring_count,
    'reporting_obligations',v_report_count,
    'assessment_rounds',v_assessment_count,
    'audits',v_audit_count,
    'improvement_projects',v_improvement_count,
    'recurring_monitoring_templates',v_recurring_monitoring_count,
    'recurring_template_ids',v_recurring_template_ids,
    'approved_at',now()
  );
end;
$function$;

revoke all on function public.qlcl_approve_plan_bundle_v10(uuid,uuid) from public, anon, authenticated;
grant execute on function public.qlcl_approve_plan_bundle_v10(uuid,uuid) to service_role;
