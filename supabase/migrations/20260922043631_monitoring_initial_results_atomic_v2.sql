create or replace function public.qlcl_monitoring_save_initial_results_v1(
  p_round_id uuid,
  p_actor_user_id uuid,
  p_target_area text,
  p_saved_at timestamptz,
  p_recheck_due_at timestamptz,
  p_responses jsonb
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
  v_expected integer;
  v_given integer;
  v_fail integer;
  v_saved jsonb;
  v_next text;
begin
  if p_round_id is null or p_actor_user_id is null or p_saved_at is null then
    raise exception 'Required monitoring parameters are missing';
  end if;
  if coalesce(trim(p_target_area),'')='' then
    raise exception 'Monitoring target area is required';
  end if;
  if jsonb_typeof(p_responses) <> 'array' then
    raise exception 'responses must be a JSON array';
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
    raise exception 'Monitoring round must be IN_PROGRESS';
  end if;

  select * into v_record
  from public.records
  where id=v_round.record_id
  for share;
  if not found or v_record.organization_id is distinct from v_actor_org then
    raise exception 'Monitoring round is outside current organization';
  end if;

  if exists(
    select 1 from public.checklist_responses
    where monitoring_round_id=p_round_id
  ) then
    raise exception 'Initial monitoring results already exist';
  end if;

  select count(*) into v_expected
  from public.checklist_items
  where checklist_version_id=v_round.checklist_version_id;

  select count(*) into v_given
  from jsonb_array_elements(p_responses);

  if v_expected<1 or v_given<>v_expected then
    raise exception 'Monitoring response count mismatch: expected %, got %',v_expected,v_given;
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_responses) x
    where coalesce(x->>'result','') not in ('PASS','FAIL','NA','PARTIAL')
       or coalesce(x->>'item_id','')=''
       or not exists(
         select 1
         from public.checklist_items i
         where i.id=(x->>'item_id')::uuid
           and i.checklist_version_id=v_round.checklist_version_id
       )
  ) then
    raise exception 'Monitoring response contains invalid item/result';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_responses) x
    join public.checklist_items i
      on i.id=(x->>'item_id')::uuid
     and i.checklist_version_id=v_round.checklist_version_id
    where x->>'result'='NA' and not i.allow_na
  ) then
    raise exception 'Monitoring response contains NA for an item that does not allow NA';
  end if;

  if exists(
    select 1 from (
      select x->>'item_id' item_id,count(*) c
      from jsonb_array_elements(p_responses) x
      group by x->>'item_id'
      having count(*)>1
    ) d
  ) then
    raise exception 'Monitoring response contains duplicate checklist item';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_responses) x
    where x ? 'score'
      and x->'score' <> 'null'::jsonb
      and jsonb_typeof(x->'score') <> 'number'
  ) then
    raise exception 'Monitoring response contains invalid score';
  end if;

  select count(*) into v_fail
  from jsonb_array_elements(p_responses) x
  where x->>'result'='FAIL';

  v_next:=case when v_fail>0 then 'IN_PROGRESS' else 'AWAITING_CONFIRMATION' end;

  with ins as (
    insert into public.checklist_responses(
      monitoring_round_id,checklist_item_id,answer_value,result_status,score,note,na_reason,
      answered_by,answered_at,followup_disposition
    )
    select
      p_round_id,
      (x->>'item_id')::uuid,
      coalesce(x->'answer_value','{}'::jsonb),
      x->>'result',
      case
        when x ? 'score' and x->'score' <> 'null'::jsonb then (x->>'score')::numeric
        else null
      end,
      nullif(trim(coalesce(x->>'note','')),''),
      case when x->>'result'='NA' then nullif(trim(coalesce(x->>'na_reason','')),'') else null end,
      p_actor_user_id,
      p_saved_at,
      case when x->>'result'='FAIL' then 'IMMEDIATE_CORRECTION' else 'NONE' end
    from jsonb_array_elements(p_responses) x
    returning id,checklist_item_id
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('id',id,'checklist_item_id',checklist_item_id)),
    '[]'::jsonb
  )
  into v_saved
  from ins;

  update public.monitoring_rounds
  set target_area=p_target_area,
      completed_at=case when v_fail>0 then null else p_saved_at end,
      workflow_status=v_next
  where id=p_round_id;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  )
  values(
    p_actor_user_id,v_round.record_id,'monitoring_rounds',p_round_id,
    'MONITORING_SAVE_INITIAL_RESULTS',
    jsonb_build_object('workflow_status',v_round.workflow_status),
    jsonb_build_object('workflow_status',v_next,'fail_count',v_fail,'response_count',v_given),
    null,
    jsonb_build_object(
      'source','qlcl-ui',
      'transaction','qlcl_monitoring_save_initial_results_v1',
      'recheck_due_at',p_recheck_due_at
    )
  );

  return jsonb_build_object(
    'ok',true,
    'status',v_next,
    'fail_count',v_fail,
    'response_count',v_given,
    'responses',v_saved
  );
end;
$$;

revoke execute on function public.qlcl_monitoring_save_initial_results_v1(uuid,uuid,text,timestamptz,timestamptz,jsonb)
  from public, anon, authenticated;
grant execute on function public.qlcl_monitoring_save_initial_results_v1(uuid,uuid,text,timestamptz,timestamptz,jsonb)
  to service_role;
