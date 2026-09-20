-- Group C (Action/My Work/Calendar) review finding: verifying a department's execution and
-- checking "are all departments now verified, so complete the parent Action" were two separate,
-- non-atomic steps in the API route. Two department heads verifying at nearly the same moment
-- could both read "still 1 remaining" (each other's, not yet committed) and both return
-- aggregate_complete:false - the parent Action would then stay stuck forever even though every
-- department had actually finished, with no error and no way for anyone to notice.
--
-- Fix: do the whole sequence (verify evidence, verify this execution, count remaining, complete
-- the parent Action if none remain) inside one function, row-locking the parent Action first so
-- concurrent verifications for the SAME Action serialize against each other.

create or replace function public.qlcl_verify_action_department_execution_v1(
  p_execution_id uuid,
  p_actor_user_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_action_id uuid;
  v_now timestamptz := now();
  v_evidence_ids uuid[];
  v_remaining_count integer;
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

  -- Lock the parent Action row so a second, concurrent call for a different execution of the
  -- SAME action waits here until this transaction commits - this is what removes the race.
  perform 1 from public.actions where id = v_action_id for update;

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

  if v_remaining_count > 0 then
    return jsonb_build_object(
      'ok', true,
      'aggregate_complete', false,
      'department_execution_status', 'VERIFIED'
    );
  end if;

  update public.actions
  set workflow_status = 'COMPLETED',
      verified_at = v_now,
      verified_by = p_actor_user_id,
      completion_note = p_note
  where id = v_action_id
    and workflow_status in ('IN_PROGRESS', 'EVIDENCE_SUBMITTED', 'VERIFYING');

  return jsonb_build_object(
    'ok', true,
    'aggregate_complete', true,
    'workflow_status', 'COMPLETED',
    'department_execution_status', 'VERIFIED',
    'verified_at', v_now
  );
end;
$function$;

revoke all on function public.qlcl_verify_action_department_execution_v1(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.qlcl_verify_action_department_execution_v1(uuid, uuid, text) to service_role;
