alter table public.recurring_work_templates
  add column if not exists automation_report_recipient text,
  add column if not exists automation_report_method text,
  add column if not exists automation_report_type text;

alter table public.recurring_work_templates
  drop constraint if exists recurring_work_templates_automation_kind_chk;

alter table public.recurring_work_templates
  add constraint recurring_work_templates_automation_kind_chk
  check (automation_kind in ('ACTION','MONITORING','REPORT'));

create or replace function public.qlcl_materialize_recurring_run_v3(
  p_run_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor public.profiles%rowtype;
  v_run public.recurring_work_runs%rowtype;
  v_template public.recurring_work_templates%rowtype;
  v_action_record_id uuid;
  v_action_id uuid;
  v_output_record_id uuid;
  v_monitoring_round_id uuid;
  v_reporting_obligation_id uuid;
  v_record_code text;
  v_output_code text;
  v_due_date date;
  v_work_year integer;
  v_checklist public.checklist_versions%rowtype;
  v_checklist_template public.checklist_templates%rowtype;
begin
  select * into v_actor from public.profiles where user_id=p_actor_user_id and is_active for update;
  if not found or v_actor.organization_id is null then raise exception 'Actor profile is invalid'; end if;

  select * into v_run from public.recurring_work_runs where id=p_run_id for update;
  if not found then raise exception 'Recurring run not found'; end if;

  select * into v_template from public.recurring_work_templates where id=v_run.template_id for update;
  if not found then raise exception 'Recurring template not found'; end if;
  if v_template.organization_id<>v_actor.organization_id then raise exception 'Recurring template is outside organization'; end if;
  if not v_template.is_active then raise exception 'Recurring template is inactive'; end if;

  if v_run.generated_action_id is not null then
    return jsonb_build_object('ok',true,'already_generated',true,'action_id',v_run.generated_action_id,'output_record_id',v_run.generated_output_record_id);
  end if;

  if v_run.planned_date is null then raise exception 'Recurring run planned date is missing'; end if;
  if v_template.lead_department_id is null or v_template.assignee_user_id is null
     or nullif(trim(coalesce(v_template.expected_result,'')),'') is null
     or nullif(trim(coalesce(v_template.evidence_requirement,'')),'') is null then
    raise exception 'Recurring template is incomplete';
  end if;

  if not exists(select 1 from public.departments d where d.id=v_template.lead_department_id and d.organization_id=v_actor.organization_id and d.is_active)
    then raise exception 'Recurring lead department is invalid'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_template.assignee_user_id and p.organization_id=v_actor.organization_id and p.is_active)
    then raise exception 'Recurring assignee is invalid'; end if;

  v_due_date:=v_run.planned_date + coalesce(v_template.due_offset_days,0);
  v_work_year:=extract(year from v_run.planned_date)::integer;

  select public.next_record_code(v_actor.organization_id,'ACTION',v_work_year) into v_record_code;
  insert into public.records(
    organization_id,record_type,record_code,title,work_year,owner_department_id,owner_user_id,lifecycle_status,created_by,metadata
  ) values(
    v_actor.organization_id,'ACTION',v_record_code,v_template.title,v_work_year,
    v_template.lead_department_id,v_template.assignee_user_id,'ACTIVE',p_actor_user_id,
    jsonb_build_object('origin','RECURRING_WORK','recurring_template_id',v_template.id,'recurring_run_id',v_run.id,'source_code',v_template.source_code,'automation_kind',v_template.automation_kind)
  ) returning id into v_action_record_id;

  insert into public.actions(
    record_id,title,description,priority,lead_department_id,assignee_user_id,start_date,due_date,
    expected_result,verification_requirement,workflow_status
  ) values(
    v_action_record_id,v_template.title,v_template.description,coalesce(v_template.priority,'NORMAL'),
    v_template.lead_department_id,v_template.assignee_user_id,v_run.planned_date,v_due_date,
    v_template.expected_result,v_template.evidence_requirement,'NOT_STARTED'
  ) returning id into v_action_id;

  if v_template.automation_kind='REPORT' then
    if nullif(trim(coalesce(v_template.automation_report_recipient,'')),'') is null then
      raise exception 'Report recipient is required';
    end if;
    if nullif(trim(coalesce(v_template.automation_report_method,'')),'') is null then
      raise exception 'Report submission method is required';
    end if;
  end if;

  if v_template.automation_kind='MONITORING' then
    if v_template.automation_ref_id is null then raise exception 'Monitoring checklist is required'; end if;
    if v_template.automation_target_department_id is null and nullif(trim(coalesce(v_template.automation_target_area,'')),'') is null then
      raise exception 'Monitoring target department or area is required';
    end if;

    select * into v_checklist from public.checklist_versions where id=v_template.automation_ref_id;
    if not found or v_checklist.status<>'PUBLISHED' then raise exception 'Monitoring checklist is invalid or not published'; end if;

    select * into v_checklist_template from public.checklist_templates where id=v_checklist.checklist_template_id;
    if not found or not v_checklist_template.is_active then raise exception 'Monitoring checklist template is inactive'; end if;
    if v_checklist_template.organization_id is not null and v_checklist_template.organization_id<>v_actor.organization_id then
      raise exception 'Monitoring checklist is outside organization';
    end if;

    if v_template.automation_target_department_id is not null and not exists(
      select 1 from public.departments d where d.id=v_template.automation_target_department_id and d.organization_id=v_actor.organization_id and d.is_active
    ) then raise exception 'Monitoring target department is invalid'; end if;

    select public.next_record_code(v_actor.organization_id,'MONITORING',v_work_year) into v_output_code;
    insert into public.records(
      organization_id,record_type,record_code,title,work_year,owner_department_id,owner_user_id,lifecycle_status,created_by,metadata
    ) values(
      v_actor.organization_id,'MONITORING',v_output_code,v_template.title||' · '||v_run.planned_date::text,v_work_year,
      v_template.lead_department_id,v_template.assignee_user_id,'ACTIVE',p_actor_user_id,
      jsonb_build_object(
        'origin','RECURRING_WORK','recurring_template_id',v_template.id,'recurring_run_id',v_run.id,
        'source_action_record_id',v_action_record_id,'source_code',v_template.source_code,'checklist_version_id',v_checklist.id,
        'target_department_id',v_template.automation_target_department_id,'target_area',v_template.automation_target_area
      )
    ) returning id into v_output_record_id;

    insert into public.monitoring_rounds(
      record_id,checklist_version_id,work_year,scheduled_date,target_department_id,target_area,lead_assessor_id,workflow_status
    ) values(
      v_output_record_id,v_checklist.id,v_work_year,v_run.planned_date,
      v_template.automation_target_department_id,nullif(trim(coalesce(v_template.automation_target_area,'')),''),
      v_template.assignee_user_id,'SCHEDULED'
    ) returning id into v_monitoring_round_id;

    insert into public.monitoring_assignments(monitoring_round_id,user_id,assignment_role)
    values(v_monitoring_round_id,v_template.assignee_user_id,'LEAD_ASSESSOR');

    insert into public.record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
    values(
      v_action_record_id,v_output_record_id,'MATERIALIZES',
      jsonb_build_object('origin','RECURRING_WORK','recurring_template_id',v_template.id,'recurring_run_id',v_run.id,'source_code',v_template.source_code),
      p_actor_user_id
    );
  end if;

  if v_template.automation_kind='REPORT' then
    select public.next_record_code(v_actor.organization_id,'REPORT',v_work_year) into v_output_code;
    insert into public.records(
      organization_id,record_type,record_code,title,work_year,owner_department_id,owner_user_id,lifecycle_status,created_by,metadata
    ) values(
      v_actor.organization_id,'REPORT',v_output_code,v_template.title||' · '||v_run.period_key,v_work_year,
      v_template.lead_department_id,v_template.assignee_user_id,'ACTIVE',p_actor_user_id,
      jsonb_build_object(
        'origin','RECURRING_WORK','recurring_template_id',v_template.id,'recurring_run_id',v_run.id,
        'source_action_record_id',v_action_record_id,'source_code',v_template.source_code,'automation_kind','REPORT',
        'period_key',v_run.period_key
      )
    ) returning id into v_output_record_id;

    insert into public.reporting_obligations(
      record_id,report_type,reporting_period,due_date,preparing_department_id,preparer_user_id,
      recipient_name,submission_method,notes,workflow_status
    ) values(
      v_output_record_id,
      coalesce(nullif(trim(coalesce(v_template.automation_report_type,'')),''),'PERIODIC'),
      'Kỳ lịch '||v_run.period_key,
      v_due_date,
      v_template.lead_department_id,
      v_template.assignee_user_id,
      trim(v_template.automation_report_recipient),
      trim(v_template.automation_report_method),
      v_template.expected_result,
      'NOT_DUE'
    ) returning id into v_reporting_obligation_id;

    insert into public.record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
    values
      (
        v_action_record_id,v_output_record_id,'MATERIALIZES',
        jsonb_build_object('origin','RECURRING_WORK','recurring_template_id',v_template.id,'recurring_run_id',v_run.id,'source_code',v_template.source_code),
        p_actor_user_id
      ),
      (
        v_output_record_id,v_action_record_id,'HAS_ACTION',
        jsonb_build_object('origin','RECURRING_WORK','recurring_template_id',v_template.id,'recurring_run_id',v_run.id,'source_code',v_template.source_code),
        p_actor_user_id
      );
  end if;

  if v_output_record_id is not null and v_template.automation_kind='MONITORING' then
    insert into public.record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
    select
      v_output_record_id,v_action_record_id,'HAS_ACTION',
      jsonb_build_object('origin','RECURRING_WORK','recurring_template_id',v_template.id,'recurring_run_id',v_run.id,'source_code',v_template.source_code),
      p_actor_user_id
    where not exists(
      select 1 from public.record_links
      where source_record_id=v_output_record_id and target_record_id=v_action_record_id and relation_type='HAS_ACTION'
    );
  end if;

  update public.recurring_work_runs
  set generated_action_id=v_action_id,generated_output_record_id=v_output_record_id,generated_at=now(),status='GENERATED'
  where id=v_run.id and generated_action_id is null;
  if not found then raise exception 'Recurring run was generated concurrently'; end if;

  insert into public.notifications(
    recipient_user_id,notification_type,priority,title,message,target_record_id,target_route,notification_event_key,is_read
  ) values(
    v_template.assignee_user_id,'RECURRING_ACTION_ASSIGNED',coalesce(v_template.priority,'NORMAL'),
    'Công việc định kỳ đã được tạo',v_template.title||' · hạn '||v_due_date::text,
    v_action_record_id,'/tasks/'||v_action_record_id::text,
    'recurring-action:'||v_run.id::text||':'||v_template.assignee_user_id::text,false
  );

  insert into public.audit_logs(actor_user_id,record_id,table_name,row_id,action_type,new_value,request_meta)
  values(
    p_actor_user_id,v_action_record_id,'recurring_work_runs',v_run.id,'MATERIALIZE_RECURRING_RUN_V3',
    jsonb_build_object('template_id',v_template.id,'source_code',v_template.source_code,'automation_kind',v_template.automation_kind,'output_record_id',v_output_record_id),
    jsonb_build_object('source','qlcl-ui','transaction','atomic')
  );

  return jsonb_build_object(
    'ok',true,'already_generated',false,'action_id',v_action_id,'action_record_id',v_action_record_id,
    'output_record_id',v_output_record_id,'monitoring_round_id',v_monitoring_round_id,'reporting_obligation_id',v_reporting_obligation_id
  );
end;
$function$;


revoke all on function public.qlcl_materialize_recurring_run_v3(uuid,uuid) from public, anon, authenticated;
grant execute on function public.qlcl_materialize_recurring_run_v3(uuid,uuid) to service_role;
