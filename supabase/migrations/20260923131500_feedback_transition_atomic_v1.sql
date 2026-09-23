-- QARICA Feedback non-terminal workflow atomic transition V1.
create or replace function public.qlcl_transition_feedback_v1(
  p_feedback_record_id uuid,
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
  v_feedback public.feedback_records%rowtype;
  v_command text := upper(trim(coalesce(p_command,'')));
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_next text;
  v_evidence integer := 0;
begin
  if p_feedback_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu phản ánh hoặc người thao tác';
  end if;
  if v_command not in ('TRIAGE','START_COORDINATION','MARK_RESPONDED') then
    raise exception 'Thao tác phản ánh không hợp lệ';
  end if;

  select r.* into v_record
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_feedback_record_id
    and r.record_type='FEEDBACK'
    and p.user_id=p_actor_user_id
    and p.is_active=true
    and r.lifecycle_status='ACTIVE'
  for update of r;

  if not found then
    raise exception 'Không tìm thấy phản ánh hoạt động hoặc ngoài phạm vi tổ chức';
  end if;

  select * into v_feedback
  from public.feedback_records
  where record_id=p_feedback_record_id
  for update;

  if not found then
    raise exception 'Không tìm thấy dữ liệu phản ánh';
  end if;

  if v_command='TRIAGE' then
    if v_feedback.workflow_status <> 'RECEIVED' then
      raise exception 'Phản ánh chưa ở trạng thái tiếp nhận';
    end if;
    if v_reason is null then
      raise exception 'Cần ghi kết quả phân loại trước khi chuyển phối hợp';
    end if;
    v_next := 'TRIAGED';

  elsif v_command='START_COORDINATION' then
    if v_feedback.workflow_status <> 'TRIAGED' then
      raise exception 'Phản ánh chưa được phân loại';
    end if;
    if v_record.owner_department_id is null and v_feedback.related_department_id is null then
      raise exception 'Cần gán khoa/phòng phối hợp trước';
    end if;
    v_next := 'COORDINATING';

  elsif v_command='MARK_RESPONDED' then
    if v_feedback.workflow_status not in ('TRIAGED','COORDINATING') then
      raise exception 'Phản ánh chưa ở trạng thái cho phép ghi nhận phản hồi';
    end if;
    if v_reason is null then
      raise exception 'Cần ghi nội dung phản hồi đã gửi';
    end if;

    select count(*) into v_evidence
    from public.evidence_links
    where record_id=p_feedback_record_id;

    if v_evidence < 1 then
      raise exception 'Cần có minh chứng phản hồi/xác minh trước khi ghi nhận đã phản hồi';
    end if;
    v_next := 'RESPONDED';
  end if;

  update public.feedback_records
  set workflow_status=v_next
  where id=v_feedback.id
    and workflow_status=v_feedback.workflow_status;

  if not found then
    raise exception 'Trạng thái phản ánh đã thay đổi. Vui lòng tải lại';
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_feedback_record_id,'feedback_records',v_feedback.id,
    'FEEDBACK_'||v_command,
    jsonb_build_object('workflow_status',v_feedback.workflow_status),
    jsonb_build_object(
      'workflow_status',v_next,
      'evidence_count',v_evidence
    ),
    v_reason,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_transition_feedback_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status',v_next,
    'evidence_count',v_evidence
  );
end;
$function$;

revoke all on function public.qlcl_transition_feedback_v1(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_transition_feedback_v1(uuid,uuid,text,text)
  to service_role;
