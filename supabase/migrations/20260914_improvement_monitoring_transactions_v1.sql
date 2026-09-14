-- QLCL-TTSG Improvement + Monitoring Transactions V1
-- Atomic Improvement Project close and core Monitoring DB transitions.
-- Storage uploads remain outside PostgreSQL transactions and are cleaned up by API on RPC failure.

begin;

create or replace function qlcl_close_improvement_project_v1(
  p_project_record_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_record records%rowtype;
  v_project improvement_projects%rowtype;
  v_incomplete integer;
  v_evidence integer;
  v_result text;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Sustainability/scale-out conclusion is required'; end if;

  select * into v_record from records where id=p_project_record_id and record_type='IMPROVEMENT_PROJECT' for update;
  if not found then raise exception 'Improvement Project record not found'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'Improvement Project record is not active'; end if;

  select * into v_project from improvement_projects where record_id=p_project_record_id for update;
  if not found then raise exception 'Improvement Project domain row not found'; end if;
  if v_project.workflow_status <> 'EVALUATED' then raise exception 'Only an EVALUATED project may be closed'; end if;

  select overall_result into v_result
  from project_closure_reviews
  where project_id=v_project.id
  order by reviewed_at desc
  limit 1;
  if coalesce(v_result,'') <> 'ACHIEVED' then raise exception 'Latest closure review must be ACHIEVED'; end if;

  select count(*) into v_incomplete
  from record_links l
  join actions a on a.record_id=l.target_record_id
  where l.source_record_id=p_project_record_id
    and l.relation_type='HAS_ACTION'
    and coalesce(a.workflow_status,'') not in ('COMPLETED','CANCELLED','NOT_APPLICABLE');
  if v_incomplete>0 then raise exception 'Improvement Project has % incomplete Action(s)',v_incomplete; end if;

  select count(*) into v_evidence from evidence_links where record_id=p_project_record_id;
  if v_evidence<1 then raise exception 'Improvement Project result evidence is required'; end if;

  update improvement_projects
  set workflow_status='CLOSED',actual_end_date=(now() at time zone 'Asia/Ho_Chi_Minh')::date,updated_at=now()
  where id=v_project.id;
  update records set lifecycle_status='CLOSED',closed_at=now(),updated_at=now() where id=p_project_record_id;
  insert into record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_project_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,trim(p_reason));
  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
  values(
    p_actor_user_id,p_project_record_id,'improvement_projects',v_project.id,'IMPROVEMENT_PROJECT_CLOSE',
    jsonb_build_object('workflow_status',v_project.workflow_status),jsonb_build_object('workflow_status','CLOSED','overall_result',v_result),
    trim(p_reason),jsonb_build_object('source','qlcl-ui','transaction','qlcl_close_improvement_project_v1')
  );
  return jsonb_build_object('ok',true,'status','CLOSED','evidence_count',v_evidence);
end;
$$;

create or replace function qlcl_monitoring_save_initial_results_v1(
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
set search_path=public
as $$
declare
  v_round monitoring_rounds%rowtype;
  v_expected integer;
  v_given integer;
  v_fail integer;
  v_saved jsonb;
  v_next text;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if jsonb_typeof(p_responses) <> 'array' then raise exception 'responses must be a JSON array'; end if;

  select * into v_round from monitoring_rounds where id=p_round_id for update;
  if not found then raise exception 'Monitoring round not found'; end if;
  if v_round.workflow_status <> 'IN_PROGRESS' then raise exception 'Monitoring round must be IN_PROGRESS'; end if;
  if exists(select 1 from checklist_responses where monitoring_round_id=p_round_id) then raise exception 'Initial monitoring results already exist'; end if;

  select count(*) into v_expected from checklist_items where checklist_version_id=v_round.checklist_version_id;
  select count(*) into v_given from jsonb_array_elements(p_responses);
  if v_expected<1 or v_given<>v_expected then raise exception 'Monitoring response count mismatch: expected %, got %',v_expected,v_given; end if;
  if exists(
    select 1 from jsonb_array_elements(p_responses) x
    where coalesce(x->>'result','') not in ('PASS','FAIL','NA')
      or not exists(select 1 from checklist_items i where i.id=(x->>'item_id')::uuid and i.checklist_version_id=v_round.checklist_version_id)
  ) then raise exception 'Monitoring response contains invalid item/result'; end if;
  if exists(
    select 1 from (
      select x->>'item_id' item_id,count(*) c from jsonb_array_elements(p_responses) x group by x->>'item_id' having count(*)>1
    ) d
  ) then raise exception 'Monitoring response contains duplicate checklist item'; end if;

  select count(*) into v_fail from jsonb_array_elements(p_responses) x where x->>'result'='FAIL';
  v_next:=case when v_fail>0 then 'IN_PROGRESS' else 'AWAITING_CONFIRMATION' end;

  with ins as (
    insert into checklist_responses(
      monitoring_round_id,checklist_item_id,answer_value,result_status,score,note,na_reason,answered_by,answered_at,followup_disposition
    )
    select
      p_round_id,
      (x->>'item_id')::uuid,
      coalesce(x->'answer_value','{}'::jsonb),
      x->>'result',
      case when x->>'result'='PASS' then 1 when x->>'result'='FAIL' then 0 else null end,
      nullif(trim(coalesce(x->>'note','')),''),
      null,
      p_actor_user_id,
      p_saved_at,
      case when x->>'result'='FAIL' then 'IMMEDIATE_CORRECTION' else 'NONE' end
    from jsonb_array_elements(p_responses) x
    returning id,checklist_item_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'checklist_item_id',checklist_item_id)),'[]'::jsonb) into v_saved from ins;

  update monitoring_rounds
  set target_area=p_target_area,
      completed_at=case when v_fail>0 then null else p_saved_at end,
      workflow_status=v_next
  where id=p_round_id;

  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
  values(
    p_actor_user_id,v_round.record_id,'monitoring_rounds',p_round_id,'MONITORING_SAVE_INITIAL_RESULTS',
    jsonb_build_object('workflow_status',v_round.workflow_status),
    jsonb_build_object('workflow_status',v_next,'fail_count',v_fail,'response_count',v_given),
    null,jsonb_build_object('source','qlcl-ui','transaction','qlcl_monitoring_save_initial_results_v1','recheck_due_at',p_recheck_due_at)
  );

  return jsonb_build_object('ok',true,'status',v_next,'fail_count',v_fail,'responses',v_saved);
end;
$$;

create or replace function qlcl_monitoring_apply_recheck_v1(
  p_round_id uuid,
  p_actor_user_id uuid,
  p_rechecked_at timestamptz,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_round monitoring_rounds%rowtype;
  v_fail_count integer;
  v_row_count integer;
  x jsonb;
  v_response checklist_responses%rowtype;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be a JSON array'; end if;

  select * into v_round from monitoring_rounds where id=p_round_id for update;
  if not found then raise exception 'Monitoring round not found'; end if;
  if v_round.workflow_status <> 'IN_PROGRESS' then raise exception 'Monitoring round must be IN_PROGRESS for recheck'; end if;

  select count(*) into v_fail_count from checklist_responses where monitoring_round_id=p_round_id and result_status='FAIL';
  select count(*) into v_row_count from jsonb_array_elements(p_rows);
  if v_fail_count<1 or v_row_count<>v_fail_count then raise exception 'Recheck row count mismatch: expected %, got %',v_fail_count,v_row_count; end if;
  if exists(select 1 from (select x->>'response_id' id,count(*) c from jsonb_array_elements(p_rows) x group by x->>'response_id' having count(*)>1) d) then raise exception 'Duplicate recheck response id'; end if;

  for x in select * from jsonb_array_elements(p_rows)
  loop
    if coalesce(trim(x->>'description'),'')='' then raise exception 'Correction description is required'; end if;
    if coalesce(x->>'result','') not in ('PASS','FAIL') then raise exception 'Invalid recheck result'; end if;
    select * into v_response
    from checklist_responses
    where id=(x->>'response_id')::uuid and monitoring_round_id=p_round_id and result_status='FAIL'
    for update;
    if not found then raise exception 'Invalid recheck response %',x->>'response_id'; end if;

    update checklist_responses
    set answer_value=
      jsonb_set(
        jsonb_set(
          coalesce(v_response.answer_value,'{}'::jsonb),
          '{followup}',
          coalesce(v_response.answer_value->'followup','{}'::jsonb) || jsonb_build_object('status','RECHECKED','rechecked_at',p_rechecked_at),
          true
        ),
        '{correction}',coalesce(x->'correction','{}'::jsonb),true
      )
    where id=v_response.id;

    insert into response_corrections(response_id,correction_description,corrected_by,corrected_at,verified_by,verified_at,result)
    values(v_response.id,trim(x->>'description'),p_actor_user_id,p_rechecked_at,p_actor_user_id,p_rechecked_at,x->>'result');
  end loop;

  update monitoring_rounds set workflow_status='AWAITING_CONFIRMATION',completed_at=p_rechecked_at where id=p_round_id;
  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
  values(
    p_actor_user_id,v_round.record_id,'monitoring_rounds',p_round_id,'MONITORING_RECHECK_COMPLETE',
    jsonb_build_object('workflow_status',v_round.workflow_status),jsonb_build_object('workflow_status','AWAITING_CONFIRMATION','recheck_count',v_row_count),
    null,jsonb_build_object('source','qlcl-ui','transaction','qlcl_monitoring_apply_recheck_v1')
  );
  return jsonb_build_object('ok',true,'status','AWAITING_CONFIRMATION','recheck_count',v_row_count);
end;
$$;

create or replace function qlcl_monitoring_confirm_v1(
  p_round_id uuid,
  p_actor_user_id uuid,
  p_full_name text,
  p_confirmed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_round monitoring_rounds%rowtype;
  v_response checklist_responses%rowtype;
  v_confirmation jsonb;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  select * into v_round from monitoring_rounds where id=p_round_id for update;
  if not found then raise exception 'Monitoring round not found'; end if;
  if v_round.workflow_status <> 'AWAITING_CONFIRMATION' then raise exception 'Monitoring round must be AWAITING_CONFIRMATION'; end if;

  select * into v_response from checklist_responses where monitoring_round_id=p_round_id order by created_at asc limit 1 for update;
  if not found then raise exception 'Monitoring responses are required before confirmation'; end if;
  v_confirmation:=jsonb_build_object('user_id',p_actor_user_id,'full_name',p_full_name,'confirmed_at',p_confirmed_at);
  update checklist_responses
  set answer_value=jsonb_set(coalesce(v_response.answer_value,'{}'::jsonb),'{qlcl_confirmation}',v_confirmation,true)
  where id=v_response.id;
  update monitoring_rounds set workflow_status='CONFIRMED' where id=p_round_id;

  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
  values(
    p_actor_user_id,v_round.record_id,'monitoring_rounds',p_round_id,'MONITORING_CONFIRM',
    jsonb_build_object('workflow_status',v_round.workflow_status),jsonb_build_object('workflow_status','CONFIRMED'),
    null,jsonb_build_object('source','qlcl-ui','transaction','qlcl_monitoring_confirm_v1')
  );
  return jsonb_build_object('ok',true,'status','CONFIRMED','confirmation',v_confirmation);
end;
$$;

revoke all on function qlcl_close_improvement_project_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function qlcl_close_improvement_project_v1(uuid,uuid,text) to service_role;
revoke all on function qlcl_monitoring_save_initial_results_v1(uuid,uuid,text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function qlcl_monitoring_save_initial_results_v1(uuid,uuid,text,timestamptz,timestamptz,jsonb) to service_role;
revoke all on function qlcl_monitoring_apply_recheck_v1(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function qlcl_monitoring_apply_recheck_v1(uuid,uuid,timestamptz,jsonb) to service_role;
revoke all on function qlcl_monitoring_confirm_v1(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function qlcl_monitoring_confirm_v1(uuid,uuid,text,timestamptz) to service_role;

commit;
