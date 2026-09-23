-- QARICA Action department submission atomic transaction V1.
create or replace function public.qlcl_submit_action_department_execution_v1(
  p_execution_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_execution public.action_department_executions%rowtype;
  v_action public.actions%rowtype;
  v_now timestamptz := now();
  v_evidence_count integer := 0;
  v_remaining_count integer := 0;
  v_aggregate_submitted boolean := false;
begin
  if p_execution_id is null or p_actor_user_id is null then
    raise exception 'Thiếu execution hoặc người gửi xác minh';
  end if;

  select * into v_execution
  from public.action_department_executions
  where id=p_execution_id;

  if not found then
    raise exception 'Không tìm thấy phần việc của khoa/phòng';
  end if;
  if v_execution.workflow_status <> 'IN_PROGRESS' then
    raise exception 'Phần việc của khoa/phòng chưa ở trạng thái đang thực hiện';
  end if;

  select * into v_action
  from public.actions
  where id=v_execution.action_id
  for update;

  if not found then
    raise exception 'Không tìm thấy Action cha';
  end if;
  if v_action.assignment_target_type <> 'DEPARTMENT' then
    raise exception 'Action không phải loại phân công theo khoa/phòng';
  end if;
  if v_action.workflow_status <> 'IN_PROGRESS' then
    raise exception 'Action cha hiện không ở trạng thái cho phép gửi xác minh';
  end if;

  select count(*) into v_evidence_count
  from public.evidence_links
  where action_department_execution_id=p_execution_id;

  if coalesce(v_action.evidence_required,true) and v_evidence_count < 1 then
    raise exception 'Cần nộp ít nhất 01 minh chứng trước khi gửi xác minh';
  end if;

  update public.action_department_executions
  set workflow_status='SUBMITTED',
      submitted_at=v_now,
      submitted_by=p_actor_user_id,
      updated_at=v_now
  where id=p_execution_id
    and workflow_status='IN_PROGRESS';

  if not found then
    raise exception 'Trạng thái phần việc đã thay đổi. Vui lòng tải lại';
  end if;

  select count(*) into v_remaining_count
  from public.action_department_executions
  where action_id=v_action.id
    and workflow_status not in ('SUBMITTED','VERIFIED','WAIVED');

  if v_remaining_count=0 then
    update public.actions
    set workflow_status='EVIDENCE_SUBMITTED',
        submitted_at=v_now,
        verified_at=null,
        verified_by=null,
        completion_note=null,
        updated_at=v_now
    where id=v_action.id
      and workflow_status='IN_PROGRESS';

    if not found then
      raise exception 'Trạng thái Action cha đã thay đổi. Vui lòng tải lại';
    end if;
    v_aggregate_submitted:=true;
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,
    v_action.record_id,
    'action_department_executions',
    p_execution_id,
    'ACTION_DEPARTMENT_EXECUTION_SUBMIT',
    jsonb_build_object(
      'department_execution_status','IN_PROGRESS',
      'action_workflow_status',v_action.workflow_status
    ),
    jsonb_build_object(
      'department_execution_status','SUBMITTED',
      'action_workflow_status',case when v_aggregate_submitted then 'EVIDENCE_SUBMITTED' else v_action.workflow_status end,
      'aggregate_submitted',v_aggregate_submitted,
      'evidence_count',v_evidence_count,
      'remaining_execution_count',v_remaining_count
    ),
    'Gửi phần việc của khoa/phòng sang bước xác minh.',
    jsonb_build_object(
      'source','qlcl-ui',
      'transaction','qlcl_submit_action_department_execution_v1'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'aggregate_submitted',v_aggregate_submitted,
    'workflow_status',case when v_aggregate_submitted then 'EVIDENCE_SUBMITTED' else 'IN_PROGRESS' end,
    'department_execution_status','SUBMITTED',
    'submitted_at',v_now,
    'evidence_count',v_evidence_count,
    'remaining_execution_count',v_remaining_count
  );
end;
$function$;

revoke all on function public.qlcl_submit_action_department_execution_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.qlcl_submit_action_department_execution_v1(uuid,uuid)
  to service_role;
