-- Extend Plan Automation V2 monitoring outputs to support whole-area monitoring.
-- Replaces the same v4 RPC signature so existing API callers stay compatible.

create or replace function public.qlcl_approve_plan_bundle_v4(
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

  v_action_record_id uuid;
  v_action_id uuid;
  v_record_code text;
  v_title text;
  v_client_id text;
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

  v_automation_kind text;
  v_automation_confirmed boolean;
  v_automation_ref_id uuid;
  v_automation_target_department_id uuid;
  v_automation_target_area text;
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
  if jsonb_typeof(v_program.specific_objectives)<>'array'
     or jsonb_array_length(v_program.specific_objectives)<1 then
    raise exception 'At least one specific objective is required';
  end if;
  if nullif(trim(coalesce(v_program.requirements,'')),'') is null then
    raise exception 'Requirements are required';
  end if;
  if jsonb_typeof(v_program.draft_actions)<>'array'
     or jsonb_array_length(v_program.draft_actions)<1 then
    raise exception 'At least one plan task is required';
  end if;

  for v_task in select value from jsonb_array_elements(v_program.draft_actions)
  loop
    v_client_id:=coalesce(nullif(trim(v_task->>'client_id'),''),'task-'||(v_count+1)::text);
    v_title:=trim(coalesce(v_task->>'title',''));
    if v_title='' then raise exception 'Task title is required'; end if;

    begin
      v_lead_department_id:=(v_task->>'lead_department_id')::uuid;
    exception when others then
      raise exception 'Task lead department is invalid';
    end;
    begin
      v_assignee_user_id:=(v_task->>'assignee_user_id')::uuid;
    exception when others then
      raise exception 'Task assignee is invalid';
    end;

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

    if not exists(
      select 1 from public.departments d
      where d.id=v_lead_department_id
        and d.organization_id=v_actor.organization_id
        and d.is_active
    ) then
      raise exception 'Task lead department is invalid or outside organization';
    end if;

    if not exists(
      select 1 from public.profiles p
      where p.user_id=v_assignee_user_id
        and p.organization_id=v_actor.organization_id
        and p.is_active
    ) then
      raise exception 'Task assignee is invalid or outside organization';
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

    v_automation_confirmed:=coalesce((v_task->>'automation_confirmed')::boolean,false);
    v_automation_kind:=upper(coalesce(nullif(trim(v_task->>'automation_kind'),''),'ACTION'));
    if v_automation_kind not in ('ACTION','INDICATOR','MONITORING','REPORT','ASSESSMENT','AUDIT','IMPROVEMENT') then
      raise exception 'Task automation kind is invalid';
    end if;
    v_automation_ref_id:=null;
    v_automation_target_department_id:=null;
    v_automation_target_area:=null;

    if v_automation_confirmed and v_automation_kind in ('INDICATOR','MONITORING','ASSESSMENT') then
      begin
        v_automation_ref_id:=(v_task->>'automation_ref_id')::uuid;
      exception when others then
        raise exception 'Automation reference is required and must be valid';
      end;
    end if;

    if v_automation_confirmed and v_automation_kind='MONITORING' then
      v_automation_target_area:=nullif(trim(coalesce(v_task->>'automation_target_area','')),'');
      if nullif(trim(coalesce(v_task->>'automation_target_department_id','')),'') is not null then
        begin
          v_automation_target_department_id:=(v_task->>'automation_target_department_id')::uuid;
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

    v_report_recipient:=nullif(trim(coalesce(v_task->>'automation_report_recipient','')),'');
    v_report_method:=nullif(trim(coalesce(v_task->>'automation_report_method','')),'');
    v_report_period:=nullif(trim(coalesce(v_task->>'automation_report_period','')),'');
    v_report_recurrence_rule:=upper(nullif(trim(coalesce(v_task->>'automation_report_recurrence_rule','')),''));
    v_report_recurrence_end_date:=nullif(v_task->>'automation_report_recurrence_end_date','')::date;
    v_assessment_round_type:=nullif(trim(coalesce(v_task->>'automation_assessment_round_type','')),'');
    v_audit_type:=nullif(trim(coalesce(v_task->>'automation_audit_type','')),'');

    if v_automation_confirmed and v_automation_kind='REPORT' then
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

    if v_automation_confirmed and v_automation_kind='AUDIT' and v_audit_type is null then
      raise exception 'Audit type is required';
    end if;

    select public.next_record_code(v_actor.organization_id,'ACTION',v_record.work_year) into v_record_code;
    insert into public.records(
      organization_id,record_type,record_code,title,work_year,
      owner_department_id,owner_user_id,lifecycle_status,created_by,metadata
    )
    values(
      v_actor.organization_id,'ACTION',v_record_code,v_title,v_record.work_year,
      v_lead_department_id,v_assignee_user_id,'ACTIVE',p_actor_user_id,
      jsonb_build_object(
        'origin','PLAN_AUTOMATION',
        'program_id',p_program_id,
        'plan_task_client_id',v_client_id,
        'automation_kind',v_automation_kind,
        'automation_confirmed',v_automation_confirmed
      )
    )
    returning id into v_action_record_id;

    insert into public.actions(
      record_id,title,description,priority,lead_department_id,assignee_user_id,
      start_date,due_date,expected_result,verification_requirement,workflow_status,
      criteria_refs,collaborating_department_ids
    )
    values(
      v_action_record_id,v_title,v_description,v_priority,v_lead_department_id,v_assignee_user_id,
      v_start_date,v_due_date,v_expected_result,v_verification_requirement,'NOT_STARTED',
      v_criteria_refs,v_collaborating_department_ids
    )
    returning id into v_action_id;

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
        'automation_kind',v_automation_kind,
        'automation_confirmed',v_automation_confirmed
      ),
      p_actor_user_id
    );

    insert into public.notifications(
      recipient_user_id,notification_type,priority,title,message,target_record_id,target_route,
      notification_event_key,is_read
    )
    values(
      v_assignee_user_id,'ACTION_ASSIGNED',v_priority,'Bạn được giao công việc mới',
      v_title,v_action_record_id,'/tasks/'||v_action_record_id::text,
      'action-assigned:'||v_action_id::text||':'||v_assignee_user_id::text,false
    );

    if v_automation_confirmed and v_automation_kind='INDICATOR' then
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
      v_output_owner_user_id:=coalesce(v_indicator_assignment.collector_user_id,v_assignee_user_id);

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

    if v_automation_confirmed and v_automation_kind='MONITORING' then
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
        v_lead_department_id,v_assignee_user_id,'ACTIVE',p_actor_user_id,
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
        v_automation_target_department_id,v_automation_target_area,v_assignee_user_id,'SCHEDULED'
      )
      returning id into v_output_domain_id;

      insert into public.monitoring_assignments(
        monitoring_round_id,user_id,assignment_role
      )
      values(v_output_domain_id,v_assignee_user_id,'LEAD_ASSESSOR');

      insert into public.record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
      values
        (v_record.id,v_output_record_id,'HAS_OUTPUT',
          jsonb_build_object('automation_kind','MONITORING','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id),
        (v_action_record_id,v_output_record_id,'MATERIALIZES',
          jsonb_build_object('automation_kind','MONITORING','plan_task_client_id',v_client_id,'program_id',p_program_id),p_actor_user_id);

      v_monitoring_count:=v_monitoring_count+1;
    end if;


    if v_automation_confirmed and v_automation_kind='REPORT' then
      select public.next_record_code(v_actor.organization_id,'REPORT',v_record.work_year) into v_output_code;
      insert into public.records(
        organization_id,record_type,record_code,title,work_year,
        owner_department_id,owner_user_id,lifecycle_status,created_by,metadata
      )
      values(
        v_actor.organization_id,'REPORT',v_output_code,v_title,v_record.work_year,
        v_lead_department_id,v_assignee_user_id,'ACTIVE',p_actor_user_id,
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
        v_lead_department_id,v_assignee_user_id,v_report_recipient,v_report_method,
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

    if v_automation_confirmed and v_automation_kind='ASSESSMENT' then
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
        v_lead_department_id,v_assignee_user_id,'ACTIVE',p_actor_user_id,
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
      where ci.criteria_version_id=v_criteria_version.id;

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

    if v_automation_confirmed and v_automation_kind='AUDIT' then
      select public.next_record_code(v_actor.organization_id,'AUDIT',v_record.work_year) into v_output_code;
      insert into public.records(
        organization_id,record_type,record_code,title,work_year,
        owner_department_id,owner_user_id,lifecycle_status,created_by,metadata
      )
      values(
        v_actor.organization_id,'AUDIT',v_output_code,v_title,v_record.work_year,
        v_lead_department_id,v_assignee_user_id,'ACTIVE',p_actor_user_id,
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
        coalesce(v_start_date,v_program.start_date),v_due_date,v_assignee_user_id,
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

    if v_automation_confirmed and v_automation_kind='IMPROVEMENT' then
      select public.next_record_code(v_actor.organization_id,'IMPROVEMENT_PROJECT',v_record.work_year) into v_output_code;
      insert into public.records(
        organization_id,record_type,record_code,title,work_year,
        owner_department_id,owner_user_id,lifecycle_status,created_by,metadata
      )
      values(
        v_actor.organization_id,'IMPROVEMENT_PROJECT',v_output_code,v_title,v_record.work_year,
        v_lead_department_id,v_assignee_user_id,'ACTIVE',p_actor_user_id,
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

    v_count:=v_count+1;
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
    p_actor_user_id,v_record.id,'work_programs',p_program_id,'APPROVE_PLAN_BUNDLE_V4',
    jsonb_build_object(
      'program_id',p_program_id,
      'materialized_actions',v_count,
      'indicator_measurements',v_indicator_count,
      'monitoring_rounds',v_monitoring_count,
      'reporting_obligations',v_report_count,
      'assessment_rounds',v_assessment_count,
      'audits',v_audit_count,
      'improvement_projects',v_improvement_count,
      'revision_no',v_program.revision_no
    ),
    jsonb_build_object('source','qlcl-ui','transaction','atomic','automation','v2')
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
    'approved_at',now()
  );
end;
$function$;

revoke all on function public.qlcl_approve_plan_bundle_v4(uuid,uuid) from public, anon, authenticated;
grant execute on function public.qlcl_approve_plan_bundle_v4(uuid,uuid) to service_role;
