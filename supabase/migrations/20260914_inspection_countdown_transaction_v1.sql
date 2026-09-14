-- QLCL-TTSG Inspection Countdown Transaction V1
-- Scope: atomic generation of Inspection countdown Actions + canonical links + notifications.
-- IMPORTANT: apply to Supabase only after preview CI PASS and database backup.

begin;

-- Each Inspection milestone offset may exist only once per Inspection event.
do $$
begin
  if exists (
    select 1
    from inspection_action_links
    group by inspection_event_id, offset_days
    having count(*) > 1
  ) then
    raise exception 'Duplicate Inspection countdown offsets exist. Resolve duplicates before applying transaction hardening.';
  end if;
end $$;

create unique index if not exists uq_inspection_action_offset
  on inspection_action_links(inspection_event_id, offset_days);

create or replace function qlcl_generate_inspection_countdown_v1(
  p_inspection_record_id uuid,
  p_lead_department_id uuid,
  p_assignee_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record records%rowtype;
  v_event inspection_events%rowtype;
  v_department departments%rowtype;
  v_profile profiles%rowtype;
  v_item record;
  v_action_code text;
  v_action_record_id uuid;
  v_action_id uuid;
  v_due_date date;
  v_created integer := 0;
begin
  if p_actor_user_id is null then
    raise exception 'actor_user_id is required';
  end if;
  if p_lead_department_id is null or p_assignee_user_id is null then
    raise exception 'lead_department_id and assignee_user_id are required';
  end if;

  select * into v_record
  from records
  where id = p_inspection_record_id
    and record_type = 'INSPECTION'
  for update;

  if not found then
    raise exception 'Inspection record not found';
  end if;
  if v_record.lifecycle_status <> 'ACTIVE' then
    raise exception 'Inspection record is not active';
  end if;

  select * into v_event
  from inspection_events
  where record_id = p_inspection_record_id
  for update;

  if not found then
    raise exception 'Inspection event not found';
  end if;
  if v_event.workflow_status not in ('PLANNING','PREPARATION') then
    raise exception 'Inspection is not in a countdown-generating state';
  end if;
  if v_event.visit_date is null then
    raise exception 'visit_date is required before countdown generation';
  end if;

  select * into v_department
  from departments
  where id = p_lead_department_id;
  if not found or not coalesce(v_department.is_active,false) or v_department.organization_id <> v_record.organization_id then
    raise exception 'Invalid lead department';
  end if;

  select * into v_profile
  from profiles
  where user_id = p_assignee_user_id;
  if not found or not coalesce(v_profile.is_active,false) or v_profile.organization_id <> v_record.organization_id then
    raise exception 'Invalid assignee';
  end if;

  for v_item in
    select * from (values
      (-30, 'D-30 · Khởi động kế hoạch tiếp đoàn', 'Phạm vi, đầu mối, tài liệu yêu cầu và kế hoạch chuẩn bị được xác định.', 'NORMAL'),
      (-14, 'D-14 · Rà soát hồ sơ và khoảng trống', 'Danh mục hồ sơ/minh chứng và các khoảng trống cần khắc phục được cập nhật.', 'NORMAL'),
      (-7,  'D-7 · Kiểm tra chéo minh chứng', 'Minh chứng đã được kiểm tra chéo; tồn tại có owner và hạn xử lý.', 'NORMAL'),
      (-3,  'D-3 · Diễn tập và chốt hậu cần', 'Hoàn tất diễn tập, phân công đón đoàn, phòng họp, thiết bị và đầu mối phối hợp.', 'HIGH'),
      (-1,  'D-1 · Kiểm tra sẵn sàng cuối', 'Danh sách sẵn sàng cuối được xác nhận; vấn đề khẩn đã được xử lý/escalate.', 'HIGH'),
      (0,   'D-Day · Điều phối tiếp đoàn', 'Nhật ký yêu cầu, người phụ trách và tài liệu cung cấp trong ngày được ghi nhận.', 'HIGH'),
      (1,   'D+1 · Tổng hợp yêu cầu sau đoàn', 'Yêu cầu bổ sung, nhận xét ban đầu và đầu việc sau đoàn được tổng hợp.', 'HIGH'),
      (7,   'D+7 · Chuyển tồn tại thành Finding/Action', 'Tồn tại/kiến nghị được chuyển thành Finding → Action/CAPA có owner và deadline.', 'NORMAL')
    ) as t(offset_days, title, expected_result, priority)
    order by offset_days
  loop
    if exists (
      select 1 from inspection_action_links
      where inspection_event_id = v_event.id
        and offset_days = v_item.offset_days
    ) then
      continue;
    end if;

    select next_record_code('ACTION', v_record.work_year) into v_action_code;
    if v_action_code is null then
      raise exception 'Could not allocate ACTION record code';
    end if;

    v_due_date := v_event.visit_date + v_item.offset_days;

    insert into records(
      organization_id, record_type, record_code, title, work_year,
      owner_department_id, owner_user_id, lifecycle_status, created_by
    ) values (
      v_record.organization_id,
      'ACTION',
      v_action_code,
      v_item.title,
      v_record.work_year,
      p_lead_department_id,
      p_assignee_user_id,
      'ACTIVE',
      p_actor_user_id
    ) returning id into v_action_record_id;

    insert into actions(
      record_id, description, priority, lead_department_id,
      assignee_user_id, start_date, due_date, expected_result,
      verification_requirement, workflow_status
    ) values (
      v_action_record_id,
      'Mốc ' || case
        when v_item.offset_days < 0 then 'D' || v_item.offset_days::text
        when v_item.offset_days = 0 then 'D-Day'
        else 'D+' || v_item.offset_days::text
      end || ' cho ' || v_record.record_code || ' · ' || v_record.title,
      v_item.priority,
      p_lead_department_id,
      p_assignee_user_id,
      null,
      v_due_date,
      v_item.expected_result,
      'Có sản phẩm/minh chứng tương ứng và được xác minh trước khi hoàn thành.',
      'NOT_STARTED'
    ) returning id into v_action_id;

    insert into record_links(
      source_record_id, target_record_id, relation_type, metadata, created_by
    ) values (
      p_inspection_record_id,
      v_action_record_id,
      'HAS_ACTION',
      jsonb_build_object('source_record_type','INSPECTION','offset_days',v_item.offset_days),
      p_actor_user_id
    );

    insert into inspection_action_links(
      inspection_event_id, action_id, offset_days
    ) values (
      v_event.id, v_action_id, v_item.offset_days
    );

    insert into notifications(
      recipient_user_id, notification_type, priority, title, message,
      target_record_id, target_route, notification_event_key, is_read
    ) values (
      p_assignee_user_id,
      'ACTION_ASSIGNED',
      v_item.priority,
      'Công việc chuẩn bị tiếp đoàn',
      v_item.title || ' · hạn ' || v_due_date::text,
      v_action_record_id,
      '/tasks/' || v_action_record_id::text,
      'inspection:' || v_event.id::text || ':' || v_item.offset_days::text || ':' || p_assignee_user_id::text,
      false
    ) on conflict (recipient_user_id, notification_event_key) do nothing;

    v_created := v_created + 1;
  end loop;

  update inspection_events
  set workflow_status = 'PREPARATION', updated_at = now()
  where id = v_event.id;

  insert into audit_logs(
    actor_user_id, record_id, table_name, row_id, action_type,
    old_value, new_value, reason, request_meta
  ) values (
    p_actor_user_id,
    p_inspection_record_id,
    'inspection_events',
    v_event.id,
    'INSPECTION_GENERATE_COUNTDOWN',
    jsonb_build_object('workflow_status', v_event.workflow_status),
    jsonb_build_object('workflow_status','PREPARATION','created_actions',v_created),
    'Tạo countdown từ ngày đoàn đến ' || v_event.visit_date::text,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_generate_inspection_countdown_v1')
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'PREPARATION',
    'created_actions', v_created,
    'visit_date', v_event.visit_date
  );
end;
$$;

revoke all on function qlcl_generate_inspection_countdown_v1(uuid,uuid,uuid,uuid) from public;
revoke all on function qlcl_generate_inspection_countdown_v1(uuid,uuid,uuid,uuid) from anon;
revoke all on function qlcl_generate_inspection_countdown_v1(uuid,uuid,uuid,uuid) from authenticated;
grant execute on function qlcl_generate_inspection_countdown_v1(uuid,uuid,uuid,uuid) to service_role;

commit;
