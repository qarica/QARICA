-- Phát hiện (báo cáo thực tế: "5 action tháng 9 còn active dù kế hoạch đã
-- hủy"): vòng lặp cascade-hủy hồ sơ con trong qlcl_change_record_lifecycle_v1
-- (PROGRAM -> action/output qua record_links HAS_ACTION/HAS_OUTPUT, xem
-- 20261009_record_lifecycle_program_cascade_v3.sql) bọc mỗi lần gọi đệ quy
-- trong `exception when others then null;` — MỌI lỗi khi hủy một hồ sơ con
-- (không chỉ đúng 2 trường hợp hồ sơ con đã ở trạng thái kết thúc hợp lệ) đều
-- bị nuốt im lặng. Hồ sơ cha hiện "Đã hủy" trong khi hồ sơ con vẫn "treo" ở
-- trạng thái đang hoạt động — không ai biết để xử lý, vi phạm nguyên tắc một
-- nghiệp vụ chỉ có một nguồn sự thật (CLAUDE.md #2). Sửa 2 việc:
--
-- 1) Chỉ bỏ qua đúng 2 thông báo lỗi hợp lệ ("đã ngưng hoạt động"/"đã đóng" —
--    hồ sơ con vốn đã ở trạng thái kết thúc từ trước, không cần/không thể hủy
--    lại, đây là no-op đúng chứ không phải lỗi). Mọi lỗi khác làm thất bại cả
--    giao dịch hủy PROGRAM (atomic — không còn trạng thái nửa vời ẩn), kèm
--    thông báo rõ ràng cho người dùng qua UI thay vì im lặng để lại dữ liệu
--    không nhất quán.
-- 2) Khi hủy một PROGRAM, dò thêm action qua program_action_links (bảng dùng
--    tính % tiến độ kế hoạch — xem comment ở 20260914_plan_action_transaction_v1.sql)
--    bên cạnh record_links HAS_ACTION/HAS_OUTPUT, đề phòng một hồ sơ con bị
--    bỏ sót hoàn toàn khỏi vòng lặp cascade (không chỉ bị nuốt lỗi) do thiếu
--    hàng record_links tương ứng.
--
-- Đồng thời khắc phục dữ liệu đã bị treo từ trước khi sửa (DO block cuối file):
-- hủy nốt các hồ sơ con đang hoạt động của những PROGRAM đã hủy rồi, dùng
-- chính RPC vừa sửa, người thực hiện là người đã hủy PROGRAM đó.
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
        union
        select a.record_id
        from public.program_action_links pal
        join public.actions a on a.id=pal.action_id
        join public.work_programs wp on wp.id=pal.program_id
        where wp.record_id=p_record_id
      loop
        begin
          perform public.qlcl_change_record_lifecycle_v1(
            v_child_record_id,p_actor_user_id,'CANCEL',
            'Tự động hủy do kế hoạch nguồn đã bị hủy.'
          );
        exception when others then
          if sqlerrm not in ('Hồ sơ đã ngưng hoạt động.','Hồ sơ đã đóng; không thể hủy.') then
            raise;
          end if;
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

-- Khắc phục dữ liệu đã treo TRƯỚC khi sửa RPC ở trên: hủy nốt các hồ sơ con
-- (action/output) đang hoạt động của những PROGRAM đã hủy rồi, dùng chính RPC
-- vừa sửa, người thực hiện là người đã hủy PROGRAM đó (lấy từ
-- record_status_history). Một PROGRAM không có lịch sử hủy hợp lệ (dữ liệu
-- cũ trước khi record_status_history ghi nhận đầy đủ) sẽ bị bỏ qua thay vì
-- đoán người thực hiện.
do $do$
declare
  v_program record;
  v_actor_user_id uuid;
  v_child record;
begin
  for v_program in
    select id from public.records where record_type='PROGRAM' and lifecycle_status='CANCELLED'
  loop
    select changed_by into v_actor_user_id
    from public.record_status_history
    where record_id=v_program.id and new_status='CANCELLED'
    order by changed_at desc
    limit 1;
    if v_actor_user_id is null then continue; end if;

    for v_child in
      select distinct r.id
      from (
        select target_record_id as record_id from public.record_links
        where source_record_id=v_program.id and relation_type in ('HAS_ACTION','HAS_OUTPUT')
        union
        select a.record_id
        from public.program_action_links pal
        join public.actions a on a.id=pal.action_id
        join public.work_programs wp on wp.id=pal.program_id
        where wp.record_id=v_program.id
      ) descendants
      join public.records r on r.id=descendants.record_id
      where r.lifecycle_status not in ('CANCELLED','ARCHIVED','RETIRED','INACTIVE','CLOSED')
    loop
      begin
        perform public.qlcl_change_record_lifecycle_v1(
          v_child.id,v_actor_user_id,'CANCEL',
          'Khắc phục dữ liệu: hồ sơ con còn hoạt động dù kế hoạch nguồn đã hủy (lỗi cascade trước bản sửa 20261030).'
        );
      exception when others then
        raise notice 'Bỏ qua hồ sơ % khi khắc phục dữ liệu: %', v_child.id, sqlerrm;
      end;
    end loop;
  end loop;
end;
$do$;
