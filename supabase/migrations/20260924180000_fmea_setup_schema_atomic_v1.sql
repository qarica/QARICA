-- QARICA FMEA setup schema alignment and atomic create V1.
alter table public.fmea_process_steps
  add column if not exists responsible_department_id uuid references public.departments(id);

alter table public.fmea_failure_modes
  add column if not exists current_control text;

create index if not exists idx_fmea_process_steps_responsible_department
  on public.fmea_process_steps(responsible_department_id)
  where responsible_department_id is not null;

create or replace function public.qlcl_add_fmea_step_v1(
  p_fmea_record_id uuid,
  p_actor_user_id uuid,
  p_sequence_no integer,
  p_step_name text,
  p_description text,
  p_responsible_department_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_study public.fmea_studies%rowtype;
  v_org uuid;
  v_step_id uuid;
begin
  if p_sequence_no is null or p_sequence_no < 1 or nullif(trim(coalesce(p_step_name,'')),'') is null then
    raise exception 'Số thứ tự và tên bước quy trình là bắt buộc';
  end if;

  select s.* into v_study
  from public.fmea_studies s
  join public.records r on r.id=s.record_id
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_fmea_record_id
    and r.record_type='FMEA'
    and r.lifecycle_status='ACTIVE'
    and p.user_id=p_actor_user_id
    and p.is_active=true
  for update of s;

  select r.organization_id into v_org
  from public.records r
  where r.id=p_fmea_record_id;

  if not found then raise exception 'FMEA không thuộc phạm vi tổ chức hiện tại hoặc đã đóng'; end if;
  if v_study.workflow_status<>'DRAFT' then raise exception 'Chỉ được sửa cấu trúc khi FMEA còn ở trạng thái Nháp'; end if;

  if p_responsible_department_id is not null and not exists(
    select 1 from public.departments d
    where d.id=p_responsible_department_id and d.organization_id=v_org and d.is_active=true
  ) then raise exception 'Khoa/phòng phụ trách không hợp lệ'; end if;

  if exists(
    select 1 from public.fmea_process_steps ps
    where ps.fmea_study_id=v_study.id and ps.sequence_no=p_sequence_no
  ) then raise exception 'Bước số % đã tồn tại',p_sequence_no; end if;

  insert into public.fmea_process_steps(
    fmea_study_id,sequence_no,step_name,description,responsible_department_id
  ) values (
    v_study.id,p_sequence_no,trim(p_step_name),nullif(trim(coalesce(p_description,'')),''),
    p_responsible_department_id
  ) returning id into v_step_id;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,new_value,request_meta
  ) values (
    p_actor_user_id,p_fmea_record_id,'fmea_process_steps',v_step_id,'FMEA_STEP_ADD',
    jsonb_build_object(
      'sequence_no',p_sequence_no,'step_name',trim(p_step_name),
      'responsible_department_id',p_responsible_department_id
    ),
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_add_fmea_step_v1')
  );

  return jsonb_build_object('ok',true,'id',v_step_id,'sequence_no',p_sequence_no);
end;
$function$;

create or replace function public.qlcl_add_fmea_mode_v1(
  p_fmea_record_id uuid,
  p_actor_user_id uuid,
  p_process_step_id uuid,
  p_failure_mode text,
  p_effect text,
  p_cause text,
  p_current_control text,
  p_is_high_priority boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_study public.fmea_studies%rowtype;
  v_step public.fmea_process_steps%rowtype;
  v_mode_id uuid;
begin
  if p_process_step_id is null or nullif(trim(coalesce(p_failure_mode,'')),'') is null then
    raise exception 'Bước quy trình và failure mode là bắt buộc';
  end if;

  select s.* into v_study
  from public.fmea_studies s
  join public.records r on r.id=s.record_id
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_fmea_record_id
    and r.record_type='FMEA'
    and r.lifecycle_status='ACTIVE'
    and p.user_id=p_actor_user_id
    and p.is_active=true
  for update of s;

  if not found then raise exception 'FMEA không thuộc phạm vi tổ chức hiện tại hoặc đã đóng'; end if;
  if v_study.workflow_status<>'DRAFT' then raise exception 'Chỉ được sửa cấu trúc khi FMEA còn ở trạng thái Nháp'; end if;

  select * into v_step
  from public.fmea_process_steps
  where id=p_process_step_id and fmea_study_id=v_study.id;

  if not found then raise exception 'Bước quy trình không thuộc FMEA này'; end if;

  if exists(
    select 1 from public.fmea_failure_modes fm
    where fm.process_step_id=p_process_step_id
      and lower(trim(coalesce(fm.failure_mode,'')))=lower(trim(p_failure_mode))
  ) then raise exception 'Failure mode này đã tồn tại trong bước quy trình'; end if;

  insert into public.fmea_failure_modes(
    process_step_id,failure_mode,effect,cause,current_control,is_high_priority
  ) values (
    p_process_step_id,trim(p_failure_mode),nullif(trim(coalesce(p_effect,'')),''),
    nullif(trim(coalesce(p_cause,'')),''),
    nullif(trim(coalesce(p_current_control,'')),''),
    coalesce(p_is_high_priority,false)
  ) returning id into v_mode_id;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,new_value,request_meta
  ) values (
    p_actor_user_id,p_fmea_record_id,'fmea_failure_modes',v_mode_id,'FMEA_FAILURE_MODE_ADD',
    jsonb_build_object(
      'process_step_id',p_process_step_id,'failure_mode',trim(p_failure_mode),
      'is_high_priority',coalesce(p_is_high_priority,false)
    ),
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_add_fmea_mode_v1')
  );

  return jsonb_build_object('ok',true,'id',v_mode_id);
end;
$function$;

revoke all on function public.qlcl_add_fmea_step_v1(uuid,uuid,integer,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.qlcl_add_fmea_step_v1(uuid,uuid,integer,text,text,uuid)
  to service_role;

revoke all on function public.qlcl_add_fmea_mode_v1(uuid,uuid,uuid,text,text,text,text,boolean)
  from public,anon,authenticated;
grant execute on function public.qlcl_add_fmea_mode_v1(uuid,uuid,uuid,text,text,text,text,boolean)
  to service_role;
