-- QARICA Safety Alert workflow atomic transition V1.
create or replace function public.qlcl_transition_safety_alert_v1(
  p_alert_record_id uuid,
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
  v_alert public.safety_alerts%rowtype;
  v_command text := upper(trim(coalesce(p_command,'')));
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_next text;
  v_now timestamptz := now();
  v_evidence integer := 0;
begin
  if p_alert_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu cảnh báo hoặc người thao tác';
  end if;
  if v_command not in ('SUBMIT_REVIEW','RETURN','PUBLISH','ARCHIVE') then
    raise exception 'Thao tác cảnh báo không hợp lệ';
  end if;

  select r.* into v_record
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_alert_record_id
    and r.record_type='SAFETY_ALERT'
    and p.user_id=p_actor_user_id
    and p.is_active=true
  for update of r;

  if not found then
    raise exception 'Không tìm thấy cảnh báo hoặc ngoài phạm vi tổ chức';
  end if;

  select * into v_alert
  from public.safety_alerts
  where record_id=p_alert_record_id
  for update;

  if not found then
    raise exception 'Không tìm thấy dữ liệu cảnh báo';
  end if;

  if v_command='SUBMIT_REVIEW' then
    if coalesce(v_alert.status,'DRAFT') <> 'DRAFT' then
      raise exception 'Cảnh báo chưa ở trạng thái Nháp';
    end if;
    if nullif(trim(coalesce(v_alert.summary,'')),'') is null
       or nullif(trim(coalesce(v_alert.lesson,'')),'') is null
       or nullif(trim(coalesce(v_alert.recommendation,'')),'') is null then
      raise exception 'Cần đủ tóm tắt, bài học và khuyến nghị trước khi gửi rà soát';
    end if;
    v_next := 'REVIEWING';

  elsif v_command='RETURN' then
    if coalesce(v_alert.status,'') <> 'REVIEWING' then
      raise exception 'Cảnh báo chưa ở trạng thái rà soát';
    end if;
    if v_reason is null then
      raise exception 'Cần lý do trả lại';
    end if;
    v_next := 'DRAFT';

  elsif v_command='PUBLISH' then
    if coalesce(v_alert.status,'') <> 'REVIEWING' then
      raise exception 'Cảnh báo chưa ở trạng thái rà soát';
    end if;
    if v_reason is null then
      raise exception 'Cần kết luận phát hành';
    end if;

    select count(*) into v_evidence
    from public.evidence_links
    where record_id=p_alert_record_id;

    if v_evidence < 1 then
      raise exception 'Cần đính kèm nguồn/bằng chứng đã rà soát trước khi phát hành';
    end if;
    v_next := 'PUBLISHED';

  elsif v_command='ARCHIVE' then
    if coalesce(v_alert.status,'') <> 'PUBLISHED' then
      raise exception 'Chỉ lưu hết hiệu lực cảnh báo đã phát hành';
    end if;
    if v_reason is null then
      raise exception 'Cần lý do lưu hết hiệu lực';
    end if;
    v_next := 'ARCHIVED';
  end if;

  update public.safety_alerts
  set status=v_next,
      published_at=case when v_command='PUBLISH' then v_now else published_at end
  where id=v_alert.id
    and coalesce(status,'DRAFT')=coalesce(v_alert.status,'DRAFT');

  if not found then
    raise exception 'Trạng thái cảnh báo đã thay đổi. Vui lòng tải lại';
  end if;

  if v_command='ARCHIVE' then
    update public.records
    set lifecycle_status='ARCHIVED',
        updated_at=v_now
    where id=p_alert_record_id;

    insert into public.record_status_history(
      record_id,old_status,new_status,changed_by,reason,changed_at
    ) values (
      p_alert_record_id,v_record.lifecycle_status,'ARCHIVED',
      p_actor_user_id,v_reason,v_now
    );
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_alert_record_id,'safety_alerts',v_alert.id,
    'SAFETY_ALERT_'||v_command,
    jsonb_build_object(
      'status',coalesce(v_alert.status,'DRAFT'),
      'record_lifecycle_status',v_record.lifecycle_status
    ),
    jsonb_build_object(
      'status',v_next,
      'record_lifecycle_status',case when v_command='ARCHIVE' then 'ARCHIVED' else v_record.lifecycle_status end,
      'evidence_count',v_evidence
    ),
    v_reason,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_transition_safety_alert_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'status',v_next,
    'record_lifecycle_status',case when v_command='ARCHIVE' then 'ARCHIVED' else v_record.lifecycle_status end,
    'evidence_count',v_evidence,
    'published_at',case when v_command='PUBLISH' then v_now else v_alert.published_at end
  );
end;
$function$;

revoke all on function public.qlcl_transition_safety_alert_v1(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_transition_safety_alert_v1(uuid,uuid,text,text)
  to service_role;
