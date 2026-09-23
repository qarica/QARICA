-- QARICA Inspection non-terminal workflow atomic transition V1.
create or replace function public.qlcl_transition_inspection_v1(
  p_inspection_record_id uuid,
  p_actor_user_id uuid,
  p_command text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_record public.records%rowtype;
  v_event public.inspection_events%rowtype;
  v_command text := upper(trim(coalesce(p_command,'')));
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_next text;
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if p_inspection_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu đợt kiểm tra hoặc người thao tác';
  end if;
  if v_command not in ('START_VISIT','COMPLETE_VISIT') then
    raise exception 'Thao tác Inspection Mode không hợp lệ';
  end if;

  select r.* into v_record
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_inspection_record_id
    and r.record_type='INSPECTION'
    and p.user_id=p_actor_user_id
    and p.is_active=true
    and r.lifecycle_status='ACTIVE'
  for update of r;

  if not found then
    raise exception 'Không tìm thấy đợt tiếp đoàn hoạt động hoặc ngoài phạm vi tổ chức';
  end if;

  select * into v_event
  from public.inspection_events
  where record_id=p_inspection_record_id
  for update;

  if not found then
    raise exception 'Không tìm thấy dữ liệu tiếp đoàn';
  end if;

  if v_command='START_VISIT' then
    if v_event.workflow_status <> 'PREPARATION' then
      raise exception 'Đợt kiểm tra chưa ở giai đoạn chuẩn bị';
    end if;
    if v_event.visit_date is null then
      raise exception 'Chưa có ngày đoàn đến';
    end if;
    if v_today < v_event.visit_date then
      raise exception 'Chưa đến ngày đoàn làm việc';
    end if;
    v_next := 'ON_SITE';

  elsif v_command='COMPLETE_VISIT' then
    if v_event.workflow_status <> 'ON_SITE' then
      raise exception 'Đợt kiểm tra chưa ở trạng thái đoàn đang làm việc';
    end if;
    if v_reason is null then
      raise exception 'Tóm tắt kết quả/kiến nghị ban đầu là bắt buộc';
    end if;
    v_next := 'FOLLOW_UP';
  end if;

  update public.inspection_events
  set workflow_status=v_next,
      updated_at=v_now
  where id=v_event.id
    and workflow_status=v_event.workflow_status;

  if not found then
    raise exception 'Trạng thái đợt kiểm tra đã thay đổi. Vui lòng tải lại';
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_inspection_record_id,'inspection_events',v_event.id,
    'INSPECTION_'||v_command,
    jsonb_build_object('workflow_status',v_event.workflow_status),
    jsonb_build_object('workflow_status',v_next,'visit_date',v_event.visit_date),
    v_reason,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_transition_inspection_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status',v_next,
    'visit_date',v_event.visit_date,
    'transitioned_at',v_now
  );
end;
$function$;

revoke all on function public.qlcl_transition_inspection_v1(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_transition_inspection_v1(uuid,uuid,text,text)
  to service_role;
