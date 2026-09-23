-- QARICA Report non-terminal workflow atomic transition V1.
create or replace function public.qlcl_transition_report_v1(
  p_report_record_id uuid,
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
  v_report public.reporting_obligations%rowtype;
  v_command text := upper(trim(coalesce(p_command,'')));
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_next text;
  v_now timestamptz := now();
  v_incomplete integer := 0;
  v_evidence integer := 0;
begin
  if p_report_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu báo cáo hoặc người thao tác';
  end if;
  if v_command not in ('START_PREPARING','SUBMIT_REVIEW','RETURN') then
    raise exception 'Thao tác báo cáo không hợp lệ';
  end if;

  select r.* into v_record
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_report_record_id
    and r.record_type='REPORT'
    and p.user_id=p_actor_user_id
    and p.is_active=true
    and r.lifecycle_status='ACTIVE'
  for update of r;

  if not found then
    raise exception 'Không tìm thấy báo cáo hoạt động hoặc ngoài phạm vi tổ chức';
  end if;

  select * into v_report
  from public.reporting_obligations
  where record_id=p_report_record_id
  for update;

  if not found then
    raise exception 'Không tìm thấy nghĩa vụ báo cáo';
  end if;

  if v_command='START_PREPARING' then
    if v_report.workflow_status not in ('NOT_DUE','DUE') then
      raise exception 'Báo cáo chưa ở trạng thái cho phép bắt đầu chuẩn bị';
    end if;
    if v_record.owner_department_id is null or v_record.owner_user_id is null
       or v_report.due_date is null
       or nullif(trim(coalesce(v_report.recipient_name,'')),'') is null then
      raise exception 'Cần đủ owner, hạn nộp và nơi nhận trước khi chuẩn bị';
    end if;
    v_next := 'PREPARING';

  elsif v_command='SUBMIT_REVIEW' then
    if v_report.workflow_status <> 'PREPARING' then
      raise exception 'Báo cáo chưa ở trạng thái đang chuẩn bị';
    end if;

    select count(*) into v_incomplete
    from public.record_links rl
    join public.actions a on a.record_id=rl.target_record_id
    where rl.source_record_id=p_report_record_id
      and rl.relation_type='HAS_ACTION'
      and a.workflow_status not in ('COMPLETED','CANCELLED','NOT_APPLICABLE');

    if v_incomplete > 0 then
      raise exception 'Còn % Action chưa hoàn thành', v_incomplete;
    end if;

    select count(*) into v_evidence
    from public.evidence_links
    where record_id=p_report_record_id;

    if v_evidence < 1 then
      raise exception 'Cần bản dự thảo/minh chứng dữ liệu trước khi gửi rà soát';
    end if;
    v_next := 'REVIEWING';

  elsif v_command='RETURN' then
    if v_report.workflow_status <> 'REVIEWING' then
      raise exception 'Báo cáo chưa ở trạng thái đang rà soát';
    end if;
    if v_reason is null then
      raise exception 'Cần lý do trả lại báo cáo';
    end if;
    v_next := 'PREPARING';
  end if;

  update public.reporting_obligations
  set workflow_status=v_next,
      updated_at=v_now
  where id=v_report.id
    and workflow_status=v_report.workflow_status;

  if not found then
    raise exception 'Trạng thái báo cáo đã thay đổi. Vui lòng tải lại';
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_report_record_id,'reporting_obligations',v_report.id,
    'REPORT_'||v_command,
    jsonb_build_object('workflow_status',v_report.workflow_status),
    jsonb_build_object(
      'workflow_status',v_next,
      'incomplete_action_count',v_incomplete,
      'evidence_count',v_evidence
    ),
    v_reason,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_transition_report_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status',v_next,
    'incomplete_action_count',v_incomplete,
    'evidence_count',v_evidence
  );
end;
$function$;

revoke all on function public.qlcl_transition_report_v1(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_transition_report_v1(uuid,uuid,text,text)
  to service_role;
