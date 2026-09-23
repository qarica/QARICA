-- QARICA create CAPA from Incident atomic transaction V1.

create unique index if not exists uq_record_links_one_generated_capa_per_incident
  on public.record_links(source_record_id)
  where relation_type='GENERATED_CAPA';

create or replace function public.qlcl_create_capa_from_incident_v1(
  p_incident_record_id uuid,
  p_actor_user_id uuid,
  p_title text,
  p_problem_statement text,
  p_priority text,
  p_approval_required boolean,
  p_effectiveness_due_date date
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor public.profiles%rowtype;
  v_record public.records%rowtype;
  v_incident public.incidents%rowtype;
  v_rca_id uuid;
  v_problem text;
  v_priority text := upper(trim(coalesce(p_priority,'')));
  v_title text;
  v_owner_department_id uuid;
  v_owner_user_id uuid;
  v_code text;
  v_capa_record_id uuid;
  v_capa_id uuid;
begin
  if p_incident_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu sự cố hoặc người tạo CAPA.';
  end if;

  select * into v_actor
  from public.profiles
  where user_id=p_actor_user_id and is_active=true;
  if not found or v_actor.organization_id is null then
    raise exception 'Tài khoản không hợp lệ hoặc chưa gắn tổ chức.';
  end if;

  select * into v_record
  from public.records
  where id=p_incident_record_id
    and record_type='INCIDENT'
    and organization_id=v_actor.organization_id
  for update;
  if not found then
    raise exception 'Không tìm thấy sự cố trong tổ chức hiện tại.';
  end if;
  if v_record.lifecycle_status <> 'ACTIVE' then
    raise exception 'Hồ sơ sự cố không còn hoạt động.';
  end if;

  select * into v_incident
  from public.incidents
  where record_id=p_incident_record_id
  for update;
  if not found then
    raise exception 'Không tìm thấy dữ liệu nghiệp vụ của sự cố.';
  end if;
  if v_incident.workflow_status not in ('INVESTIGATING','ACTION_FOLLOW_UP') then
    raise exception 'Chỉ tạo CAPA khi sự cố đang điều tra hoặc theo dõi hành động.';
  end if;

  select id into v_rca_id
  from public.rca_analyses
  where incident_id=v_incident.id
    and status='COMPLETED'
  order by completed_at desc nulls last
  limit 1;

  if v_incident.rca_required and v_rca_id is null then
    raise exception 'Sự cố yêu cầu RCA: phải hoàn tất RCA trước khi tạo CAPA.';
  end if;

  if exists (
    select 1
    from public.record_links rl
    join public.records cr on cr.id=rl.target_record_id
    where rl.source_record_id=p_incident_record_id
      and rl.relation_type='GENERATED_CAPA'
      and cr.record_type='CAPA'
      and cr.lifecycle_status<>'ARCHIVED'
  ) then
    raise exception 'Sự cố đã có CAPA liên kết.';
  end if;

  v_problem := coalesce(
    nullif(trim(coalesce(p_problem_statement,'')),''),
    nullif(trim(coalesce(v_incident.verified_description,'')),''),
    nullif(trim(coalesce(v_incident.summary,'')),''),
    nullif(trim(coalesce(v_record.title,'')),'')
  );
  if v_problem is null then
    raise exception 'Cần có mô tả vấn đề làm căn cứ CAPA.';
  end if;

  if v_priority='' then
    v_priority := case when v_incident.rca_required then 'HIGH' else 'NORMAL' end;
  end if;
  if v_priority not in ('LOW','NORMAL','HIGH','URGENT','CRITICAL') then
    raise exception 'Mức ưu tiên CAPA không hợp lệ.';
  end if;

  v_owner_department_id := coalesce(
    v_incident.lead_department_id,
    v_record.owner_department_id,
    v_actor.primary_department_id,
    v_actor.department_id
  );
  v_owner_user_id := coalesce(v_incident.case_owner_user_id,p_actor_user_id);
  v_title := coalesce(
    nullif(trim(coalesce(p_title,'')),''),
    'CAPA từ '||v_record.record_code||' · '||v_record.title
  );

  if v_owner_department_id is not null and not exists (
    select 1 from public.departments d
    where d.id=v_owner_department_id
      and d.organization_id=v_record.organization_id
      and d.is_active=true
  ) then
    raise exception 'Khoa/phòng phụ trách CAPA không hợp lệ hoặc đã ngưng.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id=v_owner_user_id
      and p.organization_id=v_record.organization_id
      and p.is_active=true
  ) then
    raise exception 'Người phụ trách CAPA không hợp lệ hoặc đã ngưng.';
  end if;

  select public.next_record_code(v_record.organization_id,'CAPA',v_record.work_year)
  into v_code;

  insert into public.records(
    organization_id,record_type,record_code,title,work_year,
    owner_department_id,owner_user_id,lifecycle_status,created_by
  ) values (
    v_record.organization_id,'CAPA',v_code,v_title,v_record.work_year,
    v_owner_department_id,v_owner_user_id,'ACTIVE',p_actor_user_id
  ) returning id into v_capa_record_id;

  insert into public.capas(
    record_id,problem_statement,priority,lead_department_id,owner_user_id,
    workflow_status,approval_required,effectiveness_due_date,rca_analysis_id
  ) values (
    v_capa_record_id,v_problem,v_priority,v_owner_department_id,v_owner_user_id,
    'DRAFT',coalesce(p_approval_required,true),p_effectiveness_due_date,v_rca_id
  ) returning id into v_capa_id;

  insert into public.record_links(
    source_record_id,target_record_id,relation_type,metadata,created_by
  ) values (
    p_incident_record_id,v_capa_record_id,'GENERATED_CAPA',
    jsonb_build_object(
      'source_record_type','INCIDENT',
      'source_record_code',v_record.record_code,
      'source_incident_id',v_incident.id,
      'rca_required',v_incident.rca_required,
      'rca_analysis_id',v_rca_id
    ),
    p_actor_user_id
  );

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    new_value,request_meta
  ) values (
    p_actor_user_id,p_incident_record_id,'record_links',v_capa_record_id,
    'GENERATE_CAPA_FROM_INCIDENT',
    jsonb_build_object(
      'capa_record_id',v_capa_record_id,
      'capa_id',v_capa_id,
      'record_code',v_code,
      'priority',v_priority,
      'rca_analysis_id',v_rca_id
    ),
    jsonb_build_object(
      'source','qlcl-ui',
      'organization_id',v_record.organization_id,
      'transaction','qlcl_create_capa_from_incident_v1'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'record_id',v_capa_record_id,
    'capa_id',v_capa_id,
    'record_code',v_code,
    'rca_analysis_id',v_rca_id
  );
end;
$function$;

revoke all on function public.qlcl_create_capa_from_incident_v1(uuid,uuid,text,text,text,boolean,date)
  from public,anon,authenticated;
grant execute on function public.qlcl_create_capa_from_incident_v1(uuid,uuid,text,text,text,boolean,date)
  to service_role;
