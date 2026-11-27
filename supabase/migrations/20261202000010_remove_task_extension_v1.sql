-- Bỏ tính năng "Xin gia hạn" và "Chọn người phê duyệt" của việc cá nhân (theo yêu cầu).
-- Một nguồn sự thật: gỡ cả bảng, hàm, trigger liên quan; hàm kiểm toán chỉ còn quy tắc "chỉ chủ việc được sửa".
-- Dữ liệu hiện có: 0 đề nghị gia hạn, 0 người phê duyệt (đã kiểm tra trực tiếp trên DB thật trước khi gỡ).
-- Lịch sử kiểm toán cũ (personal_task_audit) được giữ nguyên.

create or replace function public.record_personal_task_audit()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
 actor uuid := auth.uid();
 source_name text := case when TG_TABLE_NAME = 'personal_reminders' then 'reminder' else 'legacy' end;
 old_note text;
 new_note text;
begin
 if actor is null then return new; end if;
 if new.owner_user_id is distinct from old.owner_user_id or new.id is distinct from old.id then raise exception 'Task identity and owner cannot be changed'; end if;
 if actor is distinct from new.owner_user_id then raise exception 'Task update actor must be the owner'; end if;
 if TG_TABLE_NAME = 'personal_reminders' then old_note := old.note; new_note := new.note;
 else old_note := old.content; new_note := new.content; end if;
 if new_note is distinct from old_note then
  insert into public.personal_task_audit(owner_user_id,task_source,task_id,actor_user_id,event_type,previous_value,next_value)
  values(new.owner_user_id,source_name,new.id,actor,'PROGRESS',jsonb_build_object('note',old_note),jsonb_build_object('note',new_note));
 end if;
 if new.status is distinct from old.status then
  insert into public.personal_task_audit(owner_user_id,task_source,task_id,actor_user_id,event_type,previous_value,next_value)
  values(new.owner_user_id,source_name,new.id,actor,'STATUS',jsonb_build_object('status',old.status),jsonb_build_object('status',new.status));
 end if;
 if new.due_at is distinct from old.due_at then
  insert into public.personal_task_audit(owner_user_id,task_source,task_id,actor_user_id,event_type,previous_value,next_value)
  values(new.owner_user_id,source_name,new.id,actor,'DUE_DATE',jsonb_build_object('due_at',old.due_at),jsonb_build_object('due_at',new.due_at));
 end if;
 if new.completed_at is distinct from old.completed_at then
  insert into public.personal_task_audit(owner_user_id,task_source,task_id,actor_user_id,event_type,previous_value,next_value)
  values(new.owner_user_id,source_name,new.id,actor,'COMPLETION',jsonb_build_object('completed_at',old.completed_at),jsonb_build_object('completed_at',new.completed_at));
 end if;
 return new;
end;
$$;

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

drop function if exists public.review_personal_task_extension(uuid, boolean, text);
drop table if exists public.personal_task_extension_requests;
drop table if exists public.personal_task_approvers;
drop function if exists public.record_personal_task_extension_request();
drop function if exists public.prevent_pending_approver_change();
