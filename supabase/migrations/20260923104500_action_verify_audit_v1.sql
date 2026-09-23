-- QARICA Action department verification audit hardening V1.
create or replace function public.qlcl_verify_action_department_execution_v1(
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
  v_action_id uuid;
  v_action_record_id uuid;
  v_old_action_status text;
  v_now timestamptz := now();
  v_evidence_ids uuid[];
  v_remaining_count integer;
  v_aggregate_complete boolean := false;
begin
  if p_execution_id is null or p_actor_user_id is null then
    raise exception 'Thiếu execution hoặc người xác minh';
  end if;

  select action_id into v_action_id
  from public.action_department_executions
  where id = p_execution_id and workflow_status = 'SUBMITTED';

  if v_action_id is null then
    raise exception 'Không có khoa/phòng nào đang chờ xác minh.';
  end if;

  select a.record_id, a.workflow_status
    into v_action_record_id, v_old_action_status
  from public.actions a
  where a.id = v_action_id
  for update;

  if v_action_record_id is null then
    raise exception 'Không tìm thấy Action cha của execution.';
  end if;

  select array_agg(evidence_id) into v_evidence_ids
  from public.evidence_links
  where action_department_execution_id = p_execution_id;

  if v_evidence_ids is null or array_length(v_evidence_ids, 1) is null then
    raise exception 'Khoa/Phòng chưa có minh chứng để xác minh.';
  end if;

  update public.evidence
  set validity_status = 'VALID'
  where id = any(v_evidence_ids) and validity_status = 'PENDING';

  update public.action_department_executions
  set workflow_status = 'VERIFIED',
      verified_at = v_now,
      verified_by = p_actor_user_id,
      completed_at = v_now,
      completed_by = p_actor_user_id,
      note = coalesce(p_note, note),
      updated_at = v_now
  where id = p_execution_id;

  select count(*) into v_remaining_count
  from public.action_department_executions
  where action_id = v_action_id
    and workflow_status not in ('VERIFIED', 'WAIVED');

  if v_remaining_count = 0 then
    update public.actions
    set workflow_status = 'COMPLETED',
        verified_at = v_now,
        verified_by = p_actor_user_id,
        completion_note = p_note
    where id = v_action_id
      and workflow_status in ('IN_PROGRESS', 'EVIDENCE_SUBMITTED', 'VERIFYING');
    v_aggregate_complete := true;
  end if;

  insert into public.audit_logs(
    actor_user_id, record_id, table_name, row_id, action_type,
    old_value, new_value, reason, request_meta
  ) values (
    p_actor_user_id,
    v_action_record_id,
    'action_department_executions',
    p_execution_id,
    'ACTION_DEPARTMENT_EXECUTION_VERIFY',
    jsonb_build_object(
      'department_execution_status','SUBMITTED',
      'action_workflow_status',v_old_action_status
    ),
    jsonb_build_object(
      'department_execution_status','VERIFIED',
      'action_workflow_status',case when v_aggregate_complete then 'COMPLETED' else v_old_action_status end,
      'aggregate_complete',v_aggregate_complete,
      'evidence_count',coalesce(array_length(v_evidence_ids,1),0)
    ),
    coalesce(nullif(trim(p_note),''),'Xác minh hoàn thành thực hiện Action theo khoa/phòng.'),
    jsonb_build_object(
      'source','qlcl-ui',
      'transaction','qlcl_verify_action_department_execution_v1'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'aggregate_complete', v_aggregate_complete,
    'workflow_status', case when v_aggregate_complete then 'COMPLETED' else v_old_action_status end,
    'department_execution_status', 'VERIFIED',
    'verified_at', v_now
  );
end;
$function$;

revoke all on function public.qlcl_verify_action_department_execution_v1(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.qlcl_verify_action_department_execution_v1(uuid,uuid,text)
  to service_role;
