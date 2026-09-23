-- QARICA Feedback close atomic transaction V1.
create or replace function public.qlcl_close_feedback_v1(
  p_feedback_record_id uuid,
  p_actor_user_id uuid,
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
  v_now timestamptz := now();
  v_reason text := trim(coalesce(p_reason,''));
begin
  if p_feedback_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu phản ánh hoặc người đóng';
  end if;
  if v_reason = '' then
    raise exception 'Cần kết luận trước khi đóng phản ánh';
  end if;

  select r.* into v_record
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_feedback_record_id
    and r.record_type='FEEDBACK'
    and p.user_id=p_actor_user_id
    and p.is_active=true
  for update of r;

  if not found then
    raise exception 'Không tìm thấy phản ánh hoặc ngoài phạm vi tổ chức';
  end if;
  if v_record.lifecycle_status <> 'ACTIVE' then
    raise exception 'Phản ánh không còn hoạt động';
  end if;

  select * into v_feedback
  from public.feedback_records
  where record_id=p_feedback_record_id
  for update;

  if not found then
    raise exception 'Không tìm thấy dữ liệu phản ánh';
  end if;
  if v_feedback.workflow_status <> 'RESPONDED' then
    raise exception 'Chỉ đóng phản ánh sau khi đã phản hồi';
  end if;

  update public.feedback_records
  set workflow_status='CLOSED',
      closed_at=v_now
  where id=v_feedback.id
    and workflow_status='RESPONDED';

  if not found then
    raise exception 'Trạng thái phản ánh đã thay đổi. Vui lòng tải lại';
  end if;

  update public.records
  set lifecycle_status='CLOSED',
      closed_at=v_now,
      updated_at=v_now
  where id=p_feedback_record_id
    and lifecycle_status='ACTIVE';

  if not found then
    raise exception 'Trạng thái hồ sơ phản ánh đã thay đổi. Vui lòng tải lại';
  end if;

  insert into public.record_status_history(
    record_id,old_status,new_status,changed_by,reason
  ) values (
    p_feedback_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,v_reason
  );

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_feedback_record_id,'feedback_records',v_feedback.id,
    'FEEDBACK_CLOSE',
    jsonb_build_object(
      'workflow_status',v_feedback.workflow_status,
      'lifecycle_status',v_record.lifecycle_status
    ),
    jsonb_build_object(
      'workflow_status','CLOSED',
      'lifecycle_status','CLOSED',
      'closed_at',v_now
    ),
    v_reason,
    jsonb_build_object(
      'source','qlcl-ui',
      'transaction','qlcl_close_feedback_v1'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status','CLOSED',
    'lifecycle_status','CLOSED',
    'closed_at',v_now
  );
end;
$function$;

revoke all on function public.qlcl_close_feedback_v1(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_close_feedback_v1(uuid,uuid,text)
  to service_role;
