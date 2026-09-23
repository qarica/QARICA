-- QARICA Action department return atomic transaction V1.
create or replace function public.qlcl_return_action_department_execution_v1(
  p_execution_id uuid,
  p_actor_user_id uuid,
  p_note text
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
  v_parent_reopened boolean := false;
begin
  if p_execution_id is null or p_actor_user_id is null then
    raise exception 'Thiếu execution hoặc người trả lại';
  end if;
  if length(trim(coalesce(p_note,''))) < 5 then
    raise exception 'Vui lòng ghi rõ nội dung cần bổ sung';
  end if;

  select * into v_execution
  from public.action_department_executions
  where id=p_execution_id;

  if not found then
    raise exception 'Không tìm thấy phần việc của khoa/phòng';
  end if;
  if v_execution.workflow_status <> 'SUBMITTED' then
    raise exception 'Phần việc của khoa/phòng không ở trạng thái chờ xác minh';
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
  if v_action.workflow_status not in ('IN_PROGRESS','EVIDENCE_SUBMITTED','VERIFYING') then
    raise exception 'Action cha hiện không ở trạng thái cho phép trả lại bổ sung';
  end if;

  update public.action_department_executions
  set workflow_status='RETURNED',
      note=trim(p_note),
      verified_at=null,
      verified_by=null,
      completed_at=null,
      completed_by=null,
      updated_at=v_now
  where id=p_execution_id
    and workflow_status='SUBMITTED';

  if not found then
    raise exception 'Trạng thái phần việc đã thay đổi. Vui lòng tải lại';
  end if;

  if v_action.workflow_status in ('EVIDENCE_SUBMITTED','VERIFYING') then
    update public.actions
    set workflow_status='IN_PROGRESS',
        submitted_at=null,
        verified_at=null,
        verified_by=null,
        completion_note=null,
        updated_at=v_now
    where id=v_action.id
      and workflow_status=v_action.workflow_status;

    if not found then
      raise exception 'Trạng thái Action cha đã thay đổi. Vui lòng tải lại';
    end if;
    v_parent_reopened:=true;
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,
    v_action.record_id,
    'action_department_executions',
    p_execution_id,
    'ACTION_DEPARTMENT_EXECUTION_RETURN',
    jsonb_build_object(
      'department_execution_status','SUBMITTED',
      'action_workflow_status',v_action.workflow_status
    ),
    jsonb_build_object(
      'department_execution_status','RETURNED',
      'action_workflow_status',case when v_parent_reopened then 'IN_PROGRESS' else v_action.workflow_status end,
      'parent_reopened',v_parent_reopened
    ),
    trim(p_note),
    jsonb_build_object(
      'source','qlcl-ui',
      'transaction','qlcl_return_action_department_execution_v1'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'department_execution_status','RETURNED',
    'workflow_status',case when v_parent_reopened then 'IN_PROGRESS' else v_action.workflow_status end,
    'parent_reopened',v_parent_reopened,
    'department_id',v_execution.department_id,
    'returned_at',v_now
  );
end;
$function$;

revoke all on function public.qlcl_return_action_department_execution_v1(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_return_action_department_execution_v1(uuid,uuid,text)
  to service_role;
