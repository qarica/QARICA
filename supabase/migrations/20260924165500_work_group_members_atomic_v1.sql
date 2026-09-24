-- QARICA work-group membership atomic update V1.
create or replace function public.qlcl_update_work_group_v1(
  p_group_id uuid,
  p_actor_user_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor public.profiles%rowtype;
  v_group public.work_groups%rowtype;
  v_name text := trim(coalesce(p_payload->>'name',''));
  v_code text := nullif(trim(coalesce(p_payload->>'code','')),'');
  v_type text := upper(trim(coalesce(p_payload->>'group_type','WORKING_GROUP')));
  v_description text := nullif(trim(coalesce(p_payload->>'description','')),'');
  v_lead_department_id uuid := nullif(p_payload->>'lead_department_id','')::uuid;
  v_leader_user_id uuid := nullif(p_payload->>'leader_user_id','')::uuid;
  v_valid_from date := nullif(p_payload->>'valid_from','')::date;
  v_valid_to date := nullif(p_payload->>'valid_to','')::date;
  v_is_active boolean := coalesce((p_payload->>'is_active')::boolean,true);
  v_members jsonb := coalesce(p_payload->'members','[]'::jsonb);
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'Asia/Ho_Chi_Minh')::date;
  v_member_count integer := 0;
begin
  select * into v_actor
  from public.profiles
  where user_id=p_actor_user_id and is_active=true;
  if not found or v_actor.organization_id is null then
    raise exception 'Tài khoản không hợp lệ hoặc chưa gắn tổ chức.';
  end if;

  select * into v_group
  from public.work_groups
  where id=p_group_id and organization_id=v_actor.organization_id
  for update;
  if not found then raise exception 'Nhóm không tồn tại hoặc ngoài phạm vi tổ chức.'; end if;

  if v_name='' then raise exception 'Tên nhóm là bắt buộc.'; end if;
  if v_type not in ('WORKING_GROUP','AUDIT_TEAM','ASSESSMENT_TEAM','RCA_TEAM','IMPROVEMENT_TEAM','MONITORING_TEAM','OTHER') then
    raise exception 'Loại nhóm không hợp lệ.';
  end if;
  if v_valid_from is not null and v_valid_to is not null and v_valid_to<v_valid_from then
    raise exception 'Ngày hết hiệu lực không được trước ngày bắt đầu.';
  end if;
  if jsonb_typeof(v_members)<>'array' then raise exception 'Danh sách thành viên không hợp lệ.'; end if;

  if v_lead_department_id is not null and not exists (
    select 1 from public.departments d
    where d.id=v_lead_department_id
      and d.organization_id=v_actor.organization_id
      and d.is_active=true
  ) then
    raise exception 'Khoa/phòng đầu mối không hợp lệ.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_members) as m(user_id uuid,member_role text)
    left join public.profiles p on p.user_id=m.user_id
      and p.organization_id=v_actor.organization_id
      and p.is_active=true
    where m.user_id is null
       or p.user_id is null
       or upper(coalesce(m.member_role,'MEMBER')) not in ('LEADER','DEPUTY','SECRETARY','MEMBER')
  ) then
    raise exception 'Có thành viên hoặc vai trò thành viên không hợp lệ.';
  end if;

  if v_leader_user_id is not null and not exists (
    select 1
    from jsonb_to_recordset(v_members) as m(user_id uuid,member_role text)
    where m.user_id=v_leader_user_id
  ) then
    raise exception 'Trưởng nhóm phải nằm trong danh sách thành viên.';
  end if;

  update public.work_groups
  set code=v_code,
      name=v_name,
      group_type=v_type,
      description=v_description,
      lead_department_id=v_lead_department_id,
      leader_user_id=v_leader_user_id,
      valid_from=v_valid_from,
      valid_to=v_valid_to,
      is_active=v_is_active,
      updated_at=v_now
  where id=v_group.id;

  update public.work_group_members wgm
  set is_active=false,
      left_at=v_today,
      updated_at=v_now
  where wgm.group_id=v_group.id
    and wgm.is_active=true
    and not exists (
      select 1
      from jsonb_to_recordset(v_members) as m(user_id uuid,member_role text)
      where m.user_id=wgm.user_id
    );

  insert into public.work_group_members(
    group_id,user_id,member_role,is_active,joined_at,left_at,updated_at
  )
  select
    v_group.id,
    m.user_id,
    case when m.user_id=v_leader_user_id then 'LEADER' else upper(coalesce(m.member_role,'MEMBER')) end,
    true,
    v_valid_from,
    null,
    v_now
  from jsonb_to_recordset(v_members) as m(user_id uuid,member_role text)
  on conflict (group_id,user_id)
  do update set
    member_role=excluded.member_role,
    is_active=true,
    joined_at=excluded.joined_at,
    left_at=null,
    updated_at=excluded.updated_at;

  select count(*) into v_member_count
  from public.work_group_members
  where group_id=v_group.id and is_active=true;

  insert into public.audit_logs(
    actor_user_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,'work_groups',v_group.id,'WORK_GROUP_UPDATE',
    jsonb_build_object(
      'code',v_group.code,'name',v_group.name,'group_type',v_group.group_type,
      'lead_department_id',v_group.lead_department_id,'leader_user_id',v_group.leader_user_id,
      'valid_from',v_group.valid_from,'valid_to',v_group.valid_to,'is_active',v_group.is_active
    ),
    jsonb_build_object(
      'code',v_code,'name',v_name,'group_type',v_type,
      'lead_department_id',v_lead_department_id,'leader_user_id',v_leader_user_id,
      'valid_from',v_valid_from,'valid_to',v_valid_to,'is_active',v_is_active,
      'active_member_count',v_member_count
    ),
    'Cập nhật nhóm và đồng bộ thành viên trong cùng giao dịch.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_update_work_group_v1')
  );

  return jsonb_build_object(
    'ok',true,'id',v_group.id,'active_member_count',v_member_count
  );
end;
$function$;

revoke all on function public.qlcl_update_work_group_v1(uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.qlcl_update_work_group_v1(uuid,uuid,jsonb)
  to service_role;
