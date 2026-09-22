create or replace function public.qlcl_monitoring_schedule_v1(
  p_version_id uuid,
  p_scheduled_date date,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_org uuid;
  v_actor_active boolean;
  v_version public.checklist_versions%rowtype;
  v_template public.checklist_templates%rowtype;
  v_owner_org uuid;
  v_work_year integer;
  v_record_code text;
  v_record_id uuid;
  v_round_id uuid;
begin
  if p_version_id is null or p_scheduled_date is null or p_actor_user_id is null then
    raise exception 'Required monitoring schedule parameters are missing';
  end if;

  select organization_id,is_active
  into v_actor_org,v_actor_active
  from public.profiles
  where user_id=p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active,false) then
    raise exception 'Monitoring actor is not active';
  end if;

  select * into v_version
  from public.checklist_versions
  where id=p_version_id;
  if not found or v_version.status <> 'PUBLISHED' then
    raise exception 'Checklist version must be PUBLISHED';
  end if;

  select * into v_template
  from public.checklist_templates
  where id=v_version.checklist_template_id
  for share;
  if not found or not v_template.is_active or v_template.owner_department_id is null then
    raise exception 'Checklist template is invalid or has no owner department';
  end if;
  if v_template.organization_id is distinct from v_actor_org then
    raise exception 'Checklist template is outside current organization';
  end if;

  select organization_id into v_owner_org
  from public.departments
  where id=v_template.owner_department_id
    and is_active=true;
  if v_owner_org is null or v_owner_org is distinct from v_actor_org then
    raise exception 'Checklist owner department is invalid';
  end if;

  v_work_year:=extract(year from p_scheduled_date)::integer;
  v_record_code:=public.next_record_code(v_actor_org,'MONITORING',v_work_year);

  insert into public.records(
    organization_id,record_type,record_code,title,work_year,
    owner_department_id,owner_user_id,lifecycle_status,created_by
  )
  values(
    v_actor_org,'MONITORING',v_record_code,
    v_template.name || ' - ' || p_scheduled_date::text,
    v_work_year,v_template.owner_department_id,p_actor_user_id,'ACTIVE',p_actor_user_id
  )
  returning id into v_record_id;

  insert into public.monitoring_rounds(
    record_id,checklist_version_id,work_year,scheduled_date,
    started_at,completed_at,target_department_id,target_area,
    lead_assessor_id,workflow_status
  )
  values(
    v_record_id,p_version_id,v_work_year,p_scheduled_date,
    null,null,null,null,p_actor_user_id,'SCHEDULED'
  )
  returning id into v_round_id;

  insert into public.monitoring_assignments(
    monitoring_round_id,user_id,assignment_role
  )
  values(v_round_id,p_actor_user_id,'LEAD_ASSESSOR');

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  )
  values(
    p_actor_user_id,v_record_id,'monitoring_rounds',v_round_id,
    'MONITORING_SCHEDULE',
    null,
    jsonb_build_object(
      'workflow_status','SCHEDULED',
      'checklist_version_id',p_version_id,
      'scheduled_date',p_scheduled_date,
      'lead_assessor_id',p_actor_user_id
    ),
    null,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_monitoring_schedule_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'record_id',v_record_id,
    'round_id',v_round_id,
    'record_code',v_record_code,
    'status','SCHEDULED'
  );
end;
$$;

revoke execute on function public.qlcl_monitoring_schedule_v1(uuid,date,uuid)
  from public, anon, authenticated;
grant execute on function public.qlcl_monitoring_schedule_v1(uuid,date,uuid)
  to service_role;
