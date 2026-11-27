-- Chuyển việc cho người khác: mở rộng cho đầu việc Kế hoạch công việc (nguồn 'WORK_PLAN').
-- Cùng hàm nguyên tử như REMINDER/ACTION (kiểm tra -> cập nhật -> audit_logs -> thông báo); chỉ thêm nhánh mới.
-- Người nhận phải có quyền work_plans.view (nếu không sẽ không mở được trang kế hoạch từ thông báo).

create or replace function public.qlcl_reassign_work_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_source text,
  p_source_id uuid,
  p_to_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_to public.profiles%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_actor_name text;
  v_to_name text;
  v_title text;
  v_route text;
  v_record uuid;
  v_table text;
  r public.personal_reminders%rowtype;
  a public.actions%rowtype;
  w public.work_plan_items%rowtype;
begin
  if char_length(v_reason) < 5 then raise exception 'Chuyển việc phải ghi lý do (ít nhất 5 ký tự)'; end if;
  if p_source not in ('REMINDER', 'ACTION', 'WORK_PLAN') then raise exception 'Loại việc không hợp lệ'; end if;
  if p_actor_user_id = p_to_user_id then raise exception 'Không thể chuyển việc cho chính mình'; end if;

  select * into v_actor from public.profiles where user_id = p_actor_user_id;
  if not found or not v_actor.is_active or v_actor.organization_id is distinct from p_organization_id then
    raise exception 'Người chuyển không hợp lệ hoặc đã bị khóa';
  end if;
  select * into v_to from public.profiles where user_id = p_to_user_id;
  if not found or not v_to.is_active or v_to.organization_id is distinct from p_organization_id then
    raise exception 'Người nhận không thuộc bệnh viện hoặc đã bị khóa';
  end if;
  if not public.qlcl_user_has_permission_v1(p_to_user_id, 'tasks.view') then
    raise exception 'Người nhận chưa có quyền xem Việc của tôi';
  end if;

  perform pg_advisory_xact_lock(hashtext('work_reassign:' || p_source_id::text));
  v_actor_name := coalesce(nullif(btrim(v_actor.full_name), ''), v_actor.email);
  v_to_name := coalesce(nullif(btrim(v_to.full_name), ''), v_to.email);

  if p_source = 'REMINDER' then
    select * into r from public.personal_reminders where id = p_source_id and organization_id = p_organization_id for update;
    if not found or r.owner_user_id <> p_actor_user_id then raise exception 'Không tìm thấy việc cá nhân của bạn'; end if;
    if r.status <> 'OPEN' then raise exception 'Chỉ chuyển được việc đang mở'; end if;
    update public.personal_reminders
       set owner_user_id = p_to_user_id,
           note = '[Chuyển từ ' || v_actor_name || ' ngày ' || to_char((now() at time zone 'Asia/Ho_Chi_Minh')::date, 'DD/MM/YYYY') || ' — ' || v_reason || ']'
                  || case when r.note is null or btrim(r.note) = '' then '' else E'\n' || r.note end,
           updated_at = now()
     where id = p_source_id;
    -- Từ chối đề nghị gia hạn đang chờ (chủ việc đã đổi). Dòng người duyệt cũ ở personal_task_approvers được giữ lại:
    -- trigger của bảng đó không cho xóa, và mọi chỗ kiểm tra đều so khớp cả owner_user_id nên dòng cũ không còn hiệu lực
    -- với chủ mới; chủ mới đặt người duyệt mới sẽ ghi đè dòng này.
    update public.personal_task_extension_requests
       set status = 'REJECTED', reviewed_by = p_actor_user_id, reviewed_at = now(), review_note = 'Việc đã được chuyển cho người khác'
     where task_source = 'reminder' and task_id = p_source_id and status = 'PENDING';
    v_title := r.title; v_route := '/tasks?tab=OPEN#all-work'; v_record := null; v_table := 'personal_reminders';
  elsif p_source = 'WORK_PLAN' then
    -- Đầu việc Kế hoạch công việc: chỉ người đang phụ trách chuyển được khi đầu việc còn mở; người nhận phải xem được kế hoạch.
    if not public.qlcl_user_has_permission_v1(p_to_user_id, 'work_plans.view') then
      raise exception 'Người nhận chưa có quyền xem Kế hoạch công việc';
    end if;
    select * into w from public.work_plan_items where id = p_source_id and organization_id = p_organization_id for update;
    if not found or w.assignee_user_id is distinct from p_actor_user_id then raise exception 'Chỉ người đang phụ trách mới chuyển được đầu việc này'; end if;
    if w.status <> 'OPEN' then raise exception 'Chỉ chuyển được đầu việc đang mở'; end if;
    update public.work_plan_items set assignee_user_id = p_to_user_id, updated_at = now() where id = p_source_id;
    v_title := w.title; v_route := '/work-plans'; v_record := null; v_table := 'work_plan_items';
  else
    select a2.* into a from public.actions a2
      join public.records rec on rec.id = a2.record_id
     where a2.id = p_source_id and rec.organization_id = p_organization_id and rec.lifecycle_status = 'ACTIVE'
     for update of a2;
    if not found then raise exception 'Không tìm thấy công việc'; end if;
    if a.assignment_target_type <> 'USER' or a.assignee_user_id is distinct from p_actor_user_id then
      raise exception 'Chỉ người đang được giao trực tiếp mới chuyển được công việc này';
    end if;
    if a.workflow_status not in ('NOT_STARTED', 'IN_PROGRESS', 'RETURNED') then
      raise exception 'Công việc đang ở bước xác minh hoặc đã đóng, không chuyển được';
    end if;
    update public.actions set assignee_user_id = p_to_user_id, updated_at = now() where id = p_source_id;
    v_title := a.title; v_record := a.record_id; v_route := '/tasks/' || a.record_id::text; v_table := 'actions';
  end if;

  insert into public.audit_logs(actor_user_id, record_id, table_name, row_id, action_type, old_value, new_value, reason, request_meta)
  values (p_actor_user_id, v_record, v_table, p_source_id, 'WORK_REASSIGN',
          jsonb_build_object('source', p_source, 'owner_user_id', p_actor_user_id),
          jsonb_build_object('source', p_source, 'owner_user_id', p_to_user_id),
          v_reason, jsonb_build_object('source', 'qlcl-ui'));

  insert into public.notifications(recipient_user_id, notification_type, priority, title, message, target_record_id, target_route, notification_event_key)
  values (p_to_user_id, 'WORK_REASSIGNED', 'NORMAL', 'Bạn được chuyển việc: ' || left(v_title, 150),
          v_actor_name || ' chuyển việc này cho bạn. Lý do: ' || v_reason, v_record, v_route,
          'work-reassign:' || p_source || ':' || p_source_id::text || ':' || p_to_user_id::text || ':' || extract(epoch from clock_timestamp())::bigint::text);

  return jsonb_build_object('ok', true, 'source', p_source, 'source_id', p_source_id, 'to_user_id', p_to_user_id, 'to_name', v_to_name);
end;
$$;
revoke all on function public.qlcl_reassign_work_v1(uuid, uuid, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.qlcl_reassign_work_v1(uuid, uuid, text, uuid, uuid, text) to service_role;
