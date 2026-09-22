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
  v_record public.records%rowtype;
  v_actor_org uuid;
  v_actor_active boolean;
  v_pending_count integer;
  v_row_count integer;
  v_still_fail integer := 0;
  v_row jsonb;
  v_response public.checklist_responses%rowtype;
  v_next_status text;
  v_followup jsonb;
begin
  if p_round_id is null or p_actor_user_id is null or p_rechecked_at is null then
    raise exception 'Required recheck parameters are missing';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;

  select organization_id,is_active into v_actor_org,v_actor_active
  from public.profiles
  where user_id=p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active,false) then
    raise exception 'Monitoring actor is not active';
  end if;

  select * into v_round
  from public.monitoring_rounds
  where id=p_round_id
  for update;
  if not found then raise exception 'Monitoring round not found'; end if;
  if v_round.workflow_status <> 'IN_PROGRESS' then
    raise exception 'Monitoring round must be IN_PROGRESS for recheck';
  end if;

  select * into v_record
  from public.records
  where id=v_round.record_id
  for share;
  if not found or v_record.organization_id is distinct from v_actor_org then
    raise exception 'Monitoring round is outside current organization';
  end if;

  select count(*) into v_pending_count
  from public.checklist_responses
  where monitoring_round_id=p_round_id
    and result_status='FAIL'
    and coalesce(answer_value->'followup'->>'status','')='PENDING_RECHECK';

  select count(*) into v_row_count
  from jsonb_array_elements(p_rows);

  if v_pending_count<1 or v_row_count<>v_pending_count then
    raise exception 'Recheck row count mismatch: expected %, got %',v_pending_count,v_row_count;
  end if;

  if exists(
    select 1
    from (
      select j.value->>'response_id' as response_id,count(*) as c
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
      and coalesce(answer_value->'followup'->>'status','')='PENDING_RECHECK'
    for update;
    if not found then
      raise exception 'Invalid or already completed recheck response %',v_row->>'response_id';
    end if;

    v_followup := coalesce(v_response.answer_value->'followup','{}'::jsonb);
    if v_row->>'result'='FAIL' then
      v_still_fail := v_still_fail + 1;
      v_followup := v_followup || jsonb_build_object(
        'status','PENDING_RECHECK',
        'rechecked_at',p_rechecked_at,
        'reported_at',p_rechecked_at,
        'recheck_due_at',p_rechecked_at + interval '5 minutes'
      );
    else
      v_followup := v_followup || jsonb_build_object(
        'status','RECHECKED',
        'rechecked_at',p_rechecked_at
      );
    end if;

    update public.checklist_responses
    set answer_value =
      jsonb_set(
        jsonb_set(
          coalesce(v_response.answer_value,'{}'::jsonb),
          '{followup}',v_followup,true
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

  v_next_status := case when v_still_fail>0 then 'IN_PROGRESS' else 'AWAITING_CONFIRMATION' end;

  update public.monitoring_rounds
  set workflow_status=v_next_status,
      completed_at=case when v_still_fail>0 then null else p_rechecked_at end
  where id=p_round_id;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  )
  values(
    p_actor_user_id,v_round.record_id,'monitoring_rounds',p_round_id,
    'MONITORING_RECHECK_ATTEMPT',
    jsonb_build_object('workflow_status',v_round.workflow_status),
    jsonb_build_object(
      'workflow_status',v_next_status,
      'recheck_count',v_row_count,
      'still_fail_count',v_still_fail
    ),
    null,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_monitoring_apply_recheck_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'status',v_next_status,
    'recheck_count',v_row_count,
    'still_fail_count',v_still_fail
  );
end;
$$;

create or replace function public.qlcl_monitoring_confirm_v1(
  p_round_id uuid,
  p_actor_user_id uuid,
  p_full_name text,
  p_confirmed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.monitoring_rounds%rowtype;
  v_record public.records%rowtype;
  v_actor_org uuid;
  v_actor_active boolean;
  v_response public.checklist_responses%rowtype;
  v_confirmation jsonb;
begin
  if p_round_id is null or p_actor_user_id is null or p_confirmed_at is null then
    raise exception 'Required confirmation parameters are missing';
  end if;

  select organization_id,is_active into v_actor_org,v_actor_active
  from public.profiles
  where user_id=p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active,false) then
    raise exception 'Confirmation actor is not active';
  end if;

  select * into v_round
  from public.monitoring_rounds
  where id=p_round_id
  for update;
  if not found then raise exception 'Monitoring round not found'; end if;
  if v_round.workflow_status <> 'AWAITING_CONFIRMATION' then
    raise exception 'Monitoring round must be AWAITING_CONFIRMATION';
  end if;

  select * into v_record
  from public.records
  where id=v_round.record_id
  for share;
  if not found or v_record.organization_id is distinct from v_actor_org then
    raise exception 'Monitoring round is outside current organization';
  end if;

  if exists(
    select 1
    from public.checklist_responses
    where monitoring_round_id=p_round_id
      and result_status='FAIL'
      and coalesce(answer_value->'correction'->>'recheck_result','') <> 'PASS'
  ) then
    raise exception 'All failed items must pass recheck before confirmation';
  end if;

  select * into v_response
  from public.checklist_responses
  where monitoring_round_id=p_round_id
  order by created_at asc
  limit 1
  for update;
  if not found then
    raise exception 'Monitoring responses are required before confirmation';
  end if;

  v_confirmation:=jsonb_build_object(
    'user_id',p_actor_user_id,
    'full_name',p_full_name,
    'confirmed_at',p_confirmed_at
  );

  update public.checklist_responses
  set answer_value=jsonb_set(
    coalesce(v_response.answer_value,'{}'::jsonb),
    '{qlcl_confirmation}',v_confirmation,true
  )
  where id=v_response.id;

  update public.monitoring_rounds
  set workflow_status='CONFIRMED'
  where id=p_round_id;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  )
  values(
    p_actor_user_id,v_round.record_id,'monitoring_rounds',p_round_id,
    'MONITORING_CONFIRM',
    jsonb_build_object('workflow_status',v_round.workflow_status),
    jsonb_build_object('workflow_status','CONFIRMED'),
    null,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_monitoring_confirm_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'status','CONFIRMED',
    'confirmation',v_confirmation
  );
end;
$$;

revoke execute on function public.qlcl_monitoring_apply_recheck_v1(uuid,uuid,timestamptz,jsonb)
  from public, anon, authenticated;
grant execute on function public.qlcl_monitoring_apply_recheck_v1(uuid,uuid,timestamptz,jsonb)
  to service_role;

revoke execute on function public.qlcl_monitoring_confirm_v1(uuid,uuid,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.qlcl_monitoring_confirm_v1(uuid,uuid,text,timestamptz)
  to service_role;
