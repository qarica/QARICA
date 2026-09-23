-- QARICA CAPA core transitions atomic V1.
create or replace function public.qlcl_transition_capa_v1(
  p_capa_record_id uuid,
  p_actor_user_id uuid,
  p_command text,
  p_required_resources text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_capa public.capas%rowtype;
  v_command text := upper(trim(coalesce(p_command,'')));
  v_now timestamptz := now();
  v_old_status text;
  v_new_status text;
  v_resources text := nullif(trim(coalesce(p_required_resources,'')),'');
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
begin
  if p_capa_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu CAPA hoặc người thực hiện';
  end if;
  if v_command not in ('START','APPROVE','SET_RESOURCES') then
    raise exception 'Thao tác CAPA không hợp lệ';
  end if;

  select c.* into v_capa
  from public.capas c
  join public.records r on r.id=c.record_id
  join public.profiles p on p.organization_id=r.organization_id
  where c.record_id=p_capa_record_id
    and p.user_id=p_actor_user_id
    and p.is_active=true
    and r.lifecycle_status='ACTIVE'
  for update of c;

  if not found then
    raise exception 'Không tìm thấy CAPA hoạt động hoặc ngoài phạm vi tổ chức';
  end if;

  v_old_status := v_capa.workflow_status;
  v_new_status := v_old_status;

  if v_command='START' then
    if v_old_status <> 'DRAFT' then
      raise exception 'Chỉ CAPA nháp mới được bắt đầu';
    end if;
    v_new_status := case when v_capa.approval_required then 'PENDING_APPROVAL' else 'ROOT_CAUSE_ANALYSIS' end;
    update public.capas
    set workflow_status=v_new_status,
        updated_at=v_now
    where id=v_capa.id and workflow_status='DRAFT';
    if not found then raise exception 'Trạng thái CAPA đã thay đổi. Vui lòng tải lại'; end if;

  elsif v_command='APPROVE' then
    if v_old_status <> 'PENDING_APPROVAL' then
      raise exception 'CAPA không ở trạng thái chờ phê duyệt';
    end if;
    v_new_status := 'ROOT_CAUSE_ANALYSIS';
    update public.capas
    set workflow_status=v_new_status,
        approved_at=v_now,
        approved_by=p_actor_user_id,
        updated_at=v_now
    where id=v_capa.id and workflow_status='PENDING_APPROVAL';
    if not found then raise exception 'Trạng thái CAPA đã thay đổi. Vui lòng tải lại'; end if;

  elsif v_command='SET_RESOURCES' then
    if v_old_status='CLOSED' then
      raise exception 'CAPA đã đóng, không thể sửa nguồn lực cần';
    end if;
    if v_resources is null then
      raise exception 'Cần mô tả nguồn lực cần';
    end if;
    update public.capas
    set required_resources=v_resources,
        updated_at=v_now
    where id=v_capa.id and workflow_status=v_old_status;
    if not found then raise exception 'Trạng thái CAPA đã thay đổi. Vui lòng tải lại'; end if;
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_capa_record_id,'capas',v_capa.id,
    'CAPA_'||v_command,
    jsonb_build_object(
      'workflow_status',v_old_status,
      'required_resources',v_capa.required_resources
    ),
    jsonb_build_object(
      'workflow_status',v_new_status,
      'required_resources',case when v_command='SET_RESOURCES' then v_resources else v_capa.required_resources end
    ),
    coalesce(v_reason,
      case
        when v_command='START' and v_capa.approval_required then 'Gửi CAPA chờ phê duyệt.'
        when v_command='START' then 'Bắt đầu CAPA.'
        when v_command='APPROVE' then 'Phê duyệt CAPA để phân tích nguyên nhân và triển khai.'
        else 'Cập nhật nguồn lực cần cho CAPA.'
      end
    ),
    jsonb_build_object(
      'source','qlcl-ui',
      'transaction','qlcl_transition_capa_v1',
      'command',v_command
    )
  );

  return jsonb_build_object(
    'ok',true,
    'command',v_command,
    'workflow_status',v_new_status,
    'required_resources',case when v_command='SET_RESOURCES' then v_resources else v_capa.required_resources end,
    'updated_at',v_now
  );
end;
$function$;

revoke all on function public.qlcl_transition_capa_v1(uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_transition_capa_v1(uuid,uuid,text,text,text)
  to service_role;
