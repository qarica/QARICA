-- Tự rà theo đúng lớp lỗi "4 mắt" đã sửa cho EMR go-live gate, CAPA, Action
-- cá nhân, và chỉ số chất lượng: đợt Giám sát (5S/bảng kiểm chung) tách
-- riêng quyền monitoring.perform (người đi kiểm tra, trả dữ liệu ban đầu/
-- kiểm tra lại) và checklists.manage (Phòng QLCL xác nhận) — đúng ý định
-- "người xác nhận phải khác người đi kiểm tra". Nhưng
-- qlcl_monitoring_confirm_v1 chưa từng kiểm tra actor xác nhận có khác
-- checklist_responses.answered_by của đợt này không — route.ts còn SELECT
-- cả round.lead_assessor_id nhưng chưa bao giờ dùng để chặn. Một người có
-- cả 2 quyền (vd vừa đi kiểm tra 5S vừa thuộc Phòng QLCL) có thể tự xác
-- nhận ngay đợt mình vừa kiểm tra, không ai đối chiếu độc lập.
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

  -- "4 mắt": người xác nhận phải khác người đã trả lời (đi kiểm tra) đợt
  -- này — cùng nguyên tắc đã áp dụng cho EMR go-live gate, CAPA, Action cá
  -- nhân, và chỉ số chất lượng.
  if exists(
    select 1
    from public.checklist_responses
    where monitoring_round_id=p_round_id
      and answered_by=p_actor_user_id
  ) then
    raise exception 'Confirmation actor must differ from whoever performed this monitoring round';
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

revoke execute on function public.qlcl_monitoring_confirm_v1(uuid,uuid,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.qlcl_monitoring_confirm_v1(uuid,uuid,text,timestamptz)
  to service_role;
