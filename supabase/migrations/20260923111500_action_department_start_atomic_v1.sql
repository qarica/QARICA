-- QARICA Action department start/resume atomic transaction V1.
create or replace function public.qlcl_start_action_department_execution_v1(
  p_execution_id uuid,
  p_actor_user_id uuid,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_execution public.action_department_executions%rowtype;
  v_action public.actions%rowtype;
  v_mode text := upper(trim(coalesce(p_mode,'')));
  v_expected_execution_status text;
  v_now timestamptz := now();
  v_parent_started boolean := false;
begin
  if p_execution_id is null or p_actor_user_id is null then
    raise exception 'Thiếu execution hoặc người thực hiện';
  end if;
  if v_mode not in ('START','RESUME') then
    raise exception 'Thao tác bắt đầu/tiếp tục không hợp lệ';
  end if;

  v_expected_execution_status := case when v_mode='START' then 'NOT_STARTED' else 'RETURNED' end;

  select * into v_execution
  from public.action_department_executions
  where id=p_execution_id;

  if not found then
    raise exception 'Không tìm thấy phần việc của khoa/phòng';
  end if;
  if v_execution.workflow_status <> v_expected_execution_status then
    raise exception 'Trạng thái phần việc không phù hợp với thao tác';
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
  if v_action.workflow_status not in ('NOT_STARTED','RETURNED','IN_PROGRESS') then
    raise exception 'Action cha hiện không ở trạng thái cho phép thực hiện';
  end if;

  update public.action_department_executions
  set workflow_status='IN_PROGRESS',
      updated_at=v_now
  where id=p_execution_id
    and workflow_status=v_expected_execution_status;

  if not found then
    raise exception 'Trạng thái phần việc đã thay đổi. Vui lòng tải lại';
  end if;

  if v_action.workflow_status in ('NOT_STARTED','RETURNED') then
    update public.actions
    set workflow_status='IN_PROGRESS',
        completion_note=null,
        verified_at=null,
        verified_by=null,
        updated_at=v_now
    where id=v_action.id
      and workflow_status=v_action.workflow_status;

    if not found then
      raise exception 'Trạng thái Action cha đã thay đổi. Vui lòng tải lại';
    end if;
    v_parent_started:=true;
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,
    v_action.record_id,
    'action_department_executions',
    p_execution_id,
    case when v_mode='START' then 'ACTION_DEPARTMENT_EXECUTION_START' else 'ACTION_DEPARTMENT_EXECUTION_RESUME' end,
    jsonb_build_object(
      'department_execution_status',v_expected_execution_status,
      'action_workflow_status',v_action.workflow_status
    ),
    jsonb_build_object(
      'department_execution_status','IN_PROGRESS',
      'action_workflow_status','IN_PROGRESS',
      'parent_started',v_parent_started
    ),
    case when v_mode='START' then 'Bắt đầu thực hiện phần việc khoa/phòng.' else 'Tiếp tục thực hiện phần việc sau khi được trả lại.' end,
    jsonb_build_object(
      'source','qlcl-ui',
      'transaction','qlcl_start_action_department_execution_v1',
      'mode',v_mode
    )
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status','IN_PROGRESS',
    'department_execution_status','IN_PROGRESS',
    'parent_started',v_parent_started,
    'started_at',v_now
  );
end;
$function$;

revoke all on function public.qlcl_start_action_department_execution_v1(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_start_action_department_execution_v1(uuid,uuid,text)
  to service_role;
