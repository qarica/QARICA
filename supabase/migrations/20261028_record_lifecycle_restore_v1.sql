-- Phát hiện Trung bình: trang "Hồ sơ đã hủy" chỉ phục vụ tra cứu — hủy nhầm
-- một hồ sơ/tác vụ thì không có cách nào đưa nó trở lại hoạt động, phải tạo
-- lại từ đầu và mất luôn mã hồ sơ gốc. Thêm action RESTORE vào đúng RPC vòng
-- đời chung đã dùng cho CANCEL/ARCHIVE (qlcl_change_record_lifecycle_v1),
-- không tạo RPC/route riêng.
--
-- Giới hạn có chủ đích: RESTORE chỉ đổi records.lifecycle_status (CANCELLED
-- -> ACTIVE) và xóa closed_at — KHÔNG đụng tới workflow_status của bảng con
-- (actions/work_programs/...), vì giá trị workflow_status trước lúc hủy
-- không được lưu lại ở đâu khi CANCEL ghi đè nó thành 'CANCELLED' (xem
-- 20261009_record_lifecycle_program_cascade_v3.sql) — đoán một trạng thái
-- "an toàn" cho 10 loại hồ sơ khác nhau rủi ro sai hơn là để người dùng tự
-- vào hồ sơ chỉnh lại trạng thái vận hành sau khi khôi phục. Không cascade
-- khôi phục xuống hồ sơ con (ngược lại với cascade hủy của PROGRAM) vì không
-- phân biệt được hồ sơ con nào bị hủy do kế hoạch cha hay bị hủy độc lập từ
-- trước đó.
create or replace function public.qlcl_change_record_lifecycle_v1(
  p_record_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_record public.records%rowtype;
  v_actor public.profiles%rowtype;
  v_action text := upper(trim(coalesce(p_action,'')));
  v_target text;
  v_now timestamptz := now();
  v_child_record_id uuid;
begin
  if p_actor_user_id is null then raise exception 'Thiếu người thực hiện.'; end if;
  if v_action not in ('CANCEL','ARCHIVE','RESTORE') then raise exception 'Thao tác vòng đời hồ sơ không hợp lệ.'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Vui lòng nhập lý do rõ ràng.'; end if;

  select * into v_actor
  from public.profiles
  where user_id=p_actor_user_id and is_active=true;
  if not found or v_actor.organization_id is null then
    raise exception 'Tài khoản không hợp lệ hoặc chưa gắn tổ chức.';
  end if;

  select * into v_record
  from public.records
  where id=p_record_id
  for update;
  if not found then raise exception 'Không tìm thấy hồ sơ.'; end if;
  if v_record.organization_id <> v_actor.organization_id then
    raise exception 'Hồ sơ không thuộc tổ chức hiện tại.';
  end if;

  if v_action='CANCEL' then
    if v_record.lifecycle_status in ('CANCELLED','ARCHIVED','RETIRED','INACTIVE') then
      raise exception 'Hồ sơ đã ngưng hoạt động.';
    end if;
    if v_record.lifecycle_status='CLOSED' then
      raise exception 'Hồ sơ đã đóng; không thể hủy.';
    end if;
    v_target:='CANCELLED';

    if v_record.record_type='ACTION' then
      update public.actions set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;
    elsif v_record.record_type='PROGRAM' then
      update public.work_programs set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;

      for v_child_record_id in
        select target_record_id from public.record_links
        where source_record_id=p_record_id and relation_type in ('HAS_ACTION','HAS_OUTPUT')
      loop
        begin
          perform public.qlcl_change_record_lifecycle_v1(
            v_child_record_id,p_actor_user_id,'CANCEL',
            'Tự động hủy do kế hoạch nguồn đã bị hủy.'
          );
        exception when others then
          null;
        end;
      end loop;
    elsif v_record.record_type='REPORT' then
      update public.reporting_obligations set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;
    elsif v_record.record_type='MONITORING' then
      update public.monitoring_rounds set workflow_status='CANCELLED' where record_id=p_record_id;
    elsif v_record.record_type='FINDING' then
      update public.findings set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;
    elsif v_record.record_type='CAPA' then
      update public.capas set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;
    elsif v_record.record_type='INCIDENT' then
      update public.incidents set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;
    elsif v_record.record_type='AUDIT' then
      update public.audits set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;
    elsif v_record.record_type='FEEDBACK' then
      update public.feedback_records set workflow_status='CANCELLED' where record_id=p_record_id;
    elsif v_record.record_type='DIRECTIVE' then
      update public.external_directives set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;
    end if;
  elsif v_action='RESTORE' then
    if v_record.lifecycle_status <> 'CANCELLED' then
      raise exception 'Chỉ khôi phục được hồ sơ đang ở trạng thái Đã hủy.';
    end if;
    v_target:='ACTIVE';
  else
    if v_record.lifecycle_status='ARCHIVED' then
      return jsonb_build_object('ok',true,'status','ARCHIVED','idempotent',true);
    end if;
    v_target:='ARCHIVED';
    if v_record.record_type='PROGRAM' then
      update public.work_programs set workflow_status='ARCHIVED',updated_at=v_now where record_id=p_record_id;
    end if;
  end if;

  update public.records
  set lifecycle_status=v_target,
      closed_at=case when v_action='CANCEL' then v_now when v_action='RESTORE' then null else v_record.closed_at end,
      updated_at=v_now
  where id=p_record_id
    and organization_id=v_actor.organization_id;

  if not found then raise exception 'Hồ sơ đã thay đổi hoặc ngoài phạm vi tổ chức.'; end if;

  insert into public.record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_record_id,v_record.lifecycle_status,v_target,p_actor_user_id,trim(p_reason));

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_record_id,'records',p_record_id,
    case when v_action='CANCEL' then 'CANCEL_RECORD' when v_action='RESTORE' then 'RESTORE_RECORD' else 'ARCHIVE_RECORD' end,
    jsonb_build_object('lifecycle_status',v_record.lifecycle_status),
    jsonb_build_object('lifecycle_status',v_target),
    trim(p_reason),
    jsonb_build_object(
      'source','qlcl-ui',
      'record_type',v_record.record_type,
      'organization_id',v_actor.organization_id,
      'transaction','qlcl_change_record_lifecycle_v1'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'status',v_target,
    'old_status',v_record.lifecycle_status,
    'record_type',v_record.record_type
  );
end;
$function$;

revoke all on function public.qlcl_change_record_lifecycle_v1(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_change_record_lifecycle_v1(uuid,uuid,text,text)
  to service_role;
