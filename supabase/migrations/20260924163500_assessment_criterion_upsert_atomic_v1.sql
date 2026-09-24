-- QARICA assessment criterion atomic upsert V1.
create or replace function public.qlcl_save_criterion_assessment_v1(
  p_assessment_record_id uuid,
  p_actor_user_id uuid,
  p_criteria_item_id uuid,
  p_action text,
  p_score numeric,
  p_result text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor public.profiles%rowtype;
  v_record public.records%rowtype;
  v_round public.assessment_rounds%rowtype;
  v_scope public.assessment_round_criteria%rowtype;
  v_item public.criteria_items%rowtype;
  v_existing public.criterion_assessments%rowtype;
  v_action text := upper(trim(coalesce(p_action,'')));
  v_result text := nullif(trim(coalesce(p_result,'')),'');
  v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_now timestamptz := now();
  v_status text;
  v_saved_id uuid;
  v_can_manage boolean := false;
  v_can_assess boolean := false;
  v_support_ids uuid[];
begin
  if p_assessment_record_id is null or p_actor_user_id is null or p_criteria_item_id is null then
    raise exception 'Thiếu đợt đánh giá, người thực hiện hoặc tiêu chí.';
  end if;
  if v_action not in ('SAVE_DRAFT','SUBMIT') then
    raise exception 'Thao tác chấm tiêu chí không hợp lệ.';
  end if;
  if p_score is null and v_result is null then
    raise exception 'Cần nhập điểm hoặc kết quả đánh giá.';
  end if;

  select * into v_actor
  from public.profiles
  where user_id=p_actor_user_id and is_active=true;

  if not found or v_actor.organization_id is null then
    raise exception 'Tài khoản không hợp lệ hoặc chưa gắn tổ chức.';
  end if;

  select
    exists(
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id=ur.role_id
      join public.permissions pe on pe.id=rp.permission_id
      where ur.user_id=p_actor_user_id and pe.code='criteria.manage' and pe.is_active=true
    ),
    exists(
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id=ur.role_id
      join public.permissions pe on pe.id=rp.permission_id
      where ur.user_id=p_actor_user_id and pe.code='criteria.assess' and pe.is_active=true
    )
  into v_can_manage,v_can_assess;

  if not v_can_manage and not v_can_assess then
    raise exception 'Bạn chưa có quyền tự đánh giá tiêu chí.';
  end if;

  select * into v_record
  from public.records
  where id=p_assessment_record_id
    and record_type='ASSESSMENT'
    and organization_id=v_actor.organization_id
  for update;

  if not found or v_record.lifecycle_status<>'ACTIVE' then
    raise exception 'Đợt tự đánh giá không thuộc phạm vi tổ chức hiện tại hoặc đã đóng.';
  end if;

  select * into v_round
  from public.assessment_rounds
  where record_id=v_record.id
  for update;

  if not found or v_round.workflow_status<>'IN_PROGRESS' then
    raise exception 'Chỉ được chấm khi đợt đang ở giai đoạn tự đánh giá.';
  end if;

  select * into v_scope
  from public.assessment_round_criteria
  where assessment_round_id=v_round.id
    and (criteria_item_id=p_criteria_item_id or criterion_id=p_criteria_item_id)
  limit 1;

  if not found then raise exception 'Tiêu chí không thuộc phạm vi của đợt này.'; end if;
  if upper(coalesce(v_scope.applicability_status,'APPLICABLE'))<>'APPLICABLE' then
    raise exception 'Tiêu chí này được xác định Không áp dụng trong kỳ nên không chấm điểm.';
  end if;

  select * into v_item
  from public.criteria_items
  where id=coalesce(v_scope.criteria_item_id,v_scope.criterion_id)
    and criteria_version_id=v_round.criteria_version_id;

  if not found then raise exception 'Tiêu chí không thuộc phiên bản bộ tiêu chí của đợt này.'; end if;
  if p_score is not null and (p_score<0 or (v_item.max_score is not null and p_score>v_item.max_score)) then
    raise exception 'Điểm vượt ngoài phạm vi cấu hình của tiêu chí.';
  end if;

  v_support_ids:=coalesce(v_scope.support_department_ids,'{}'::uuid[]);
  if v_scope.lead_department_id is not null
     and not v_can_manage
     and v_actor.primary_department_id is distinct from v_scope.lead_department_id
     and not (v_actor.primary_department_id=any(v_support_ids)) then
    raise exception 'Tiêu chí này được phân công cho đơn vị khác.';
  end if;

  select * into v_existing
  from public.criterion_assessments
  where assessment_round_id=v_round.id
    and criteria_item_id=p_criteria_item_id
  for update;

  if found and v_existing.workflow_status in ('REVIEWED','FINALIZED','COMPLETED','APPROVED') then
    raise exception 'Tiêu chí đã được rà soát/chốt nên không thể sửa.';
  end if;

  v_status:=case when v_action='SUBMIT' then 'SUBMITTED' else 'DRAFT' end;

  insert into public.criterion_assessments(
    assessment_round_id,criteria_item_id,score,result,note,assessed_by,
    workflow_status,submitted_at,updated_at
  ) values (
    v_round.id,p_criteria_item_id,p_score,v_result,v_note,p_actor_user_id,
    v_status,case when v_status='SUBMITTED' then v_now else null end,v_now
  )
  on conflict (assessment_round_id,criteria_item_id)
    where criteria_item_id is not null
  do update set
    score=excluded.score,
    result=excluded.result,
    note=excluded.note,
    assessed_by=excluded.assessed_by,
    workflow_status=excluded.workflow_status,
    submitted_at=excluded.submitted_at,
    updated_at=excluded.updated_at
  returning id into v_saved_id;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,v_record.id,'criterion_assessments',v_saved_id,
    case when v_action='SUBMIT' then 'SUBMIT_CRITERION_ASSESSMENT' else 'SAVE_CRITERION_ASSESSMENT_DRAFT' end,
    case when v_existing.id is null then null else jsonb_build_object(
      'score',v_existing.score,'result',v_existing.result,'workflow_status',v_existing.workflow_status
    ) end,
    jsonb_build_object(
      'criteria_item_id',p_criteria_item_id,'score',p_score,
      'result',v_result,'workflow_status',v_status
    ),
    v_note,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_save_criterion_assessment_v1')
  );

  return jsonb_build_object(
    'ok',true,'id',v_saved_id,'status',v_status,
    'message',case when v_status='SUBMITTED' then 'Đã gửi đánh giá tiêu chí.' else 'Đã lưu nháp tiêu chí.' end
  );
end;
$function$;

revoke all on function public.qlcl_save_criterion_assessment_v1(uuid,uuid,uuid,text,numeric,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_save_criterion_assessment_v1(uuid,uuid,uuid,text,numeric,text,text)
  to service_role;
