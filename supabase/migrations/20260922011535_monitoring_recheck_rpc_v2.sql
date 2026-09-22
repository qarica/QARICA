-- Fix Monitoring recheck RPC ambiguity and harden its SECURITY DEFINER search path.
create or replace function public.qlcl_monitoring_apply_recheck_v1(
  p_round_id uuid,
  p_actor_user_id uuid,
  p_rechecked_at timestamptz,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.monitoring_rounds%rowtype;
  v_fail_count integer;
  v_row_count integer;
  v_row jsonb;
  v_response public.checklist_responses%rowtype;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be a JSON array'; end if;

  select * into v_round
  from public.monitoring_rounds
  where id=p_round_id
  for update;
  if not found then raise exception 'Monitoring round not found'; end if;
  if v_round.workflow_status <> 'IN_PROGRESS' then
    raise exception 'Monitoring round must be IN_PROGRESS for recheck';
  end if;

  select count(*) into v_fail_count
  from public.checklist_responses
  where monitoring_round_id=p_round_id and result_status='FAIL';

  select count(*) into v_row_count
  from jsonb_array_elements(p_rows) as j(value);

  if v_fail_count<1 or v_row_count<>v_fail_count then
    raise exception 'Recheck row count mismatch: expected %, got %',v_fail_count,v_row_count;
  end if;

  if exists(
    select 1
    from (
      select j.value->>'response_id' as response_id, count(*) as c
      from jsonb_array_elements(p_rows) as j(value)
      group by j.value->>'response_id'
      having count(*)>1
    ) d
  ) then
    raise exception 'Duplicate recheck response id';
  end if;

  for v_row in
    select j.value from jsonb_array_elements(p_rows) as j(value)
  loop
    if coalesce(trim(v_row->>'description'),'')='' then
      raise exception 'Correction description is required';
    end if;
    if coalesce(v_row->>'result','') not in ('PASS','FAIL') then
      raise exception 'Invalid recheck result';
    end if;

    select * into v_response
    from public.checklist_responses
    where id=(v_row->>'response_id')::uuid
      and monitoring_round_id=p_round_id
      and result_status='FAIL'
    for update;
    if not found then
      raise exception 'Invalid recheck response %',v_row->>'response_id';
    end if;

    update public.checklist_responses
    set answer_value =
      jsonb_set(
        jsonb_set(
          coalesce(v_response.answer_value,'{}'::jsonb),
          '{followup}',
          coalesce(v_response.answer_value->'followup','{}'::jsonb)
            || jsonb_build_object('status','RECHECKED','rechecked_at',p_rechecked_at),
          true
        ),
        '{correction}',
        coalesce(v_row->'correction','{}'::jsonb),
        true
      )
    where id=v_response.id;

    insert into public.response_corrections(
      response_id,correction_description,corrected_by,corrected_at,
      verified_by,verified_at,result
    )
    values(
      v_response.id,trim(v_row->>'description'),p_actor_user_id,p_rechecked_at,
      p_actor_user_id,p_rechecked_at,v_row->>'result'
    );
  end loop;

  update public.monitoring_rounds
  set workflow_status='AWAITING_CONFIRMATION',
      completed_at=p_rechecked_at
  where id=p_round_id;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  )
  values(
    p_actor_user_id,v_round.record_id,'monitoring_rounds',p_round_id,
    'MONITORING_RECHECK_COMPLETE',
    jsonb_build_object('workflow_status',v_round.workflow_status),
    jsonb_build_object('workflow_status','AWAITING_CONFIRMATION','recheck_count',v_row_count),
    null,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_monitoring_apply_recheck_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'status','AWAITING_CONFIRMATION',
    'recheck_count',v_row_count
  );
end;
$$;

revoke execute on function public.qlcl_monitoring_apply_recheck_v1(uuid,uuid,timestamptz,jsonb)
  from public, anon, authenticated;
grant execute on function public.qlcl_monitoring_apply_recheck_v1(uuid,uuid,timestamptz,jsonb)
  to service_role;
