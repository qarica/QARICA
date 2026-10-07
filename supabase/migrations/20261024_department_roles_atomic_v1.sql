-- Phát hiện từ báo cáo thẩm định: lưu "Nhân sự & vai trò" khoa/phòng chạy 2
-- lệnh DB không chung transaction (vô hiệu hóa vai trò cũ, rồi mới insert vai
-- trò mới) — nếu insert lỗi giữa chừng, khoa/phòng mất sạch Trưởng + Mạng
-- lưới QLCL mà không có gì thay thế. Gộp vào 1 RPC atomic, cùng mẫu hình với
-- các RPC qlcl_*_v1 khác trong hệ thống (security definer, khóa dòng, ghi
-- audit_logs).
create or replace function public.qlcl_set_department_roles_v1(
  p_department_id uuid,
  p_actor_user_id uuid,
  p_head_user_id uuid,
  p_network_user_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_department public.departments%rowtype;
  v_network_ids uuid[] := coalesce(p_network_user_ids, '{}');
  v_user_ids uuid[];
  v_valid_count integer;
  v_now timestamptz := now();
  v_row jsonb;
begin
  if p_department_id is null or p_actor_user_id is null then
    raise exception 'Thiếu khoa/phòng hoặc người thao tác';
  end if;

  select organization_id into v_org
  from public.profiles
  where user_id = p_actor_user_id and is_active = true;
  if v_org is null then
    raise exception 'Tài khoản không hợp lệ hoặc chưa gắn bệnh viện';
  end if;

  select * into v_department
  from public.departments
  where id = p_department_id and organization_id = v_org
  for update;
  if not found then
    raise exception 'Khoa/phòng không thuộc bệnh viện hiện tại';
  end if;

  v_user_ids := array(select distinct u from unnest(array_cat(array[p_head_user_id], v_network_ids)) as u where u is not null);
  if array_length(v_user_ids, 1) > 0 then
    select count(*) into v_valid_count
    from public.profiles
    where user_id = any(v_user_ids) and organization_id = v_org and is_active = true;
    if v_valid_count <> array_length(v_user_ids, 1) then
      raise exception 'Có người dùng không hợp lệ, đã ngưng hoặc không thuộc bệnh viện';
    end if;
  end if;

  update public.department_user_roles
  set is_active = false, valid_to = v_now, updated_at = v_now
  where department_id = p_department_id
    and organization_id = v_org
    and role_type in ('HEAD','QUALITY_NETWORK_MEMBER')
    and is_active = true;

  if p_head_user_id is not null then
    insert into public.department_user_roles(organization_id, department_id, user_id, role_type, is_primary, is_active, valid_from, created_by)
    values (v_org, p_department_id, p_head_user_id, 'HEAD', true, true, v_now, p_actor_user_id);
  end if;

  if array_length(v_network_ids, 1) > 0 then
    insert into public.department_user_roles(organization_id, department_id, user_id, role_type, is_primary, is_active, valid_from, created_by)
    select v_org, p_department_id, u, 'QUALITY_NETWORK_MEMBER', false, true, v_now, p_actor_user_id
    from unnest(v_network_ids) as u;
  end if;

  v_row := jsonb_build_object('head_user_id', p_head_user_id, 'quality_network_user_ids', to_jsonb(v_network_ids));

  insert into public.audit_logs(actor_user_id, table_name, row_id, action_type, new_value, reason, request_meta)
  values (
    p_actor_user_id, 'department_user_roles', p_department_id, 'DEPARTMENT_ROLES_SET',
    v_row,
    'Cập nhật Trưởng/Phụ trách và Mạng lưới QLCL của khoa/phòng.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_set_department_roles_v1')
  );

  return jsonb_build_object('ok', true, 'department_id', p_department_id, 'head_user_id', p_head_user_id, 'quality_network_user_ids', to_jsonb(v_network_ids), 'complete', p_head_user_id is not null and array_length(v_network_ids,1) > 0);
end;
$function$;

revoke all on function public.qlcl_set_department_roles_v1(uuid,uuid,uuid,uuid[])
  from public,anon,authenticated;
grant execute on function public.qlcl_set_department_roles_v1(uuid,uuid,uuid,uuid[])
  to service_role;
