-- QARICA External Assessment atomic workflow V1.

create unique index if not exists uq_record_links_compared_self_source
  on public.record_links(source_record_id, relation_type)
  where relation_type='COMPARED_WITH_SELF';

create or replace function public.qlcl_link_external_assessment_self_v1(
  p_external_record_id uuid,
  p_self_record_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_external public.records%rowtype;
  v_event public.external_assessment_events%rowtype;
  v_self public.records%rowtype;
  v_round public.assessment_rounds%rowtype;
  v_link public.record_links%rowtype;
  v_link_id uuid;
begin
  if p_external_record_id is null or p_self_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu hồ sơ đánh giá ngoài, đợt tự đánh giá hoặc người thực hiện';
  end if;

  select r.* into v_external
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_external_record_id
    and r.record_type='EXTERNAL_ASSESSMENT'
    and r.lifecycle_status='ACTIVE'
    and p.user_id=p_actor_user_id
    and p.is_active=true
  for update of r;

  if not found then
    raise exception 'Không tìm thấy đánh giá ngoài hoạt động hoặc ngoài phạm vi tổ chức';
  end if;

  select * into v_event
  from public.external_assessment_events
  where record_id=p_external_record_id;

  if not found then
    raise exception 'Thiếu dữ liệu đợt đánh giá ngoài';
  end if;

  select * into v_self
  from public.records
  where id=p_self_record_id
    and organization_id=v_external.organization_id
    and record_type='ASSESSMENT';

  if not found then
    raise exception 'Đợt tự đánh giá được chọn không hợp lệ';
  end if;

  select * into v_round
  from public.assessment_rounds
  where record_id=p_self_record_id;

  if not found then
    raise exception 'Không tìm thấy đợt tự đánh giá nguồn';
  end if;
  if v_round.workflow_status <> 'FINALIZED' then
    raise exception 'Chỉ được đối chiếu với đợt tự đánh giá đã chốt';
  end if;
  if v_event.criteria_version_id is not null
     and v_round.criteria_version_id is distinct from v_event.criteria_version_id then
    raise exception 'Đánh giá ngoài và tự đánh giá phải cùng phiên bản bộ tiêu chí';
  end if;

  select * into v_link
  from public.record_links
  where source_record_id=p_external_record_id
    and relation_type='COMPARED_WITH_SELF'
  for update;

  if found and v_link.target_record_id <> p_self_record_id then
    raise exception 'Đợt đối chiếu đã được khóa; không được thay để bảo toàn dấu vết';
  end if;

  if found then
    update public.record_links
    set metadata=jsonb_build_object('self_record_code',v_self.record_code)
    where id=v_link.id
    returning id into v_link_id;
  else
    insert into public.record_links(
      source_record_id,target_record_id,relation_type,metadata,created_by
    ) values (
      p_external_record_id,p_self_record_id,'COMPARED_WITH_SELF',
      jsonb_build_object('self_record_code',v_self.record_code),p_actor_user_id
    )
    returning id into v_link_id;
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_external_record_id,'external_assessment_events',v_event.id,
    'EXTERNAL_ASSESSMENT_LINK_SELF',
    jsonb_build_object(
      'self_record_id',p_self_record_id,
      'self_record_code',v_self.record_code,
      'criteria_version_id',v_round.criteria_version_id,
      'link_id',v_link_id
    ),
    'Khóa đợt tự đánh giá dùng để đối chiếu đánh giá ngoài.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_link_external_assessment_self_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'self_record_id',p_self_record_id,
    'self_record_code',v_self.record_code,
    'link_id',v_link_id
  );
end;
$function$;

create or replace function public.qlcl_save_external_assessment_score_v1(
  p_external_record_id uuid,
  p_actor_user_id uuid,
  p_criteria_item_id uuid,
  p_external_score numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_external public.records%rowtype;
  v_event public.external_assessment_events%rowtype;
  v_self_record_id uuid;
  v_round public.assessment_rounds%rowtype;
  v_applicability text;
  v_self_score numeric;
  v_max_score numeric;
  v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_score_id uuid;
  v_now timestamptz := now();
begin
  if p_external_record_id is null or p_actor_user_id is null or p_criteria_item_id is null or p_external_score is null then
    raise exception 'Thiếu hồ sơ, tiêu chí, điểm hoặc người thực hiện';
  end if;

  select r.* into v_external
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_external_record_id
    and r.record_type='EXTERNAL_ASSESSMENT'
    and r.lifecycle_status='ACTIVE'
    and p.user_id=p_actor_user_id
    and p.is_active=true;

  if not found then
    raise exception 'Không tìm thấy đánh giá ngoài hoạt động hoặc ngoài phạm vi tổ chức';
  end if;

  select * into v_event
  from public.external_assessment_events
  where record_id=p_external_record_id;

  if not found then
    raise exception 'Thiếu dữ liệu đợt đánh giá ngoài';
  end if;

  select target_record_id into v_self_record_id
  from public.record_links
  where source_record_id=p_external_record_id
    and relation_type='COMPARED_WITH_SELF';

  if v_self_record_id is null then
    raise exception 'Cần khóa đợt tự đánh giá đối chiếu trước';
  end if;

  select * into v_round
  from public.assessment_rounds
  where record_id=v_self_record_id;

  if not found or v_round.workflow_status <> 'FINALIZED' then
    raise exception 'Đợt tự đánh giá nguồn không còn ở trạng thái đã chốt';
  end if;
  if v_event.criteria_version_id is not null
     and v_round.criteria_version_id is distinct from v_event.criteria_version_id then
    raise exception 'Đợt tự đánh giá không cùng phiên bản bộ tiêu chí';
  end if;

  select applicability_status into v_applicability
  from public.assessment_round_criteria
  where assessment_round_id=v_round.id
    and (criteria_item_id=p_criteria_item_id or criterion_id=p_criteria_item_id)
  limit 1;

  if v_applicability is null then
    raise exception 'Tiêu chí không nằm trong phạm vi đợt tự đánh giá đã chốt';
  end if;
  if v_applicability <> 'APPLICABLE' then
    raise exception 'Tiêu chí Không áp dụng (N/A) không được nhập điểm đánh giá ngoài';
  end if;

  select score into v_self_score
  from public.criterion_assessments
  where assessment_round_id=v_round.id
    and criteria_item_id=p_criteria_item_id
  limit 1;

  if v_self_score is null then
    raise exception 'Tiêu chí chưa có điểm tự đánh giá đã chốt để đối chiếu';
  end if;

  select max_score into v_max_score
  from public.criteria_items
  where id=p_criteria_item_id
    and criteria_version_id=v_round.criteria_version_id;

  if not found then
    raise exception 'Tiêu chí không thuộc bộ tiêu chí đang đối chiếu';
  end if;
  if p_external_score < 0 or (v_max_score is not null and p_external_score > v_max_score) then
    raise exception 'Điểm đoàn Sở Y tế nằm ngoài thang điểm của tiêu chí';
  end if;

  insert into public.external_assessment_scores(
    external_assessment_event_id,criteria_item_id,self_score,external_score,
    note,entered_by,updated_at
  ) values (
    v_event.id,p_criteria_item_id,v_self_score,p_external_score,
    v_note,p_actor_user_id,v_now
  )
  on conflict (external_assessment_event_id,criteria_item_id)
  do update set
    self_score=excluded.self_score,
    external_score=excluded.external_score,
    note=excluded.note,
    entered_by=excluded.entered_by,
    updated_at=excluded.updated_at
  returning id into v_score_id;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_external_record_id,'external_assessment_scores',v_score_id,
    'SAVE_EXTERNAL_ASSESSMENT_SCORE',
    jsonb_build_object(
      'criteria_item_id',p_criteria_item_id,
      'self_score',v_self_score,
      'external_score',p_external_score
    ),
    v_note,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_save_external_assessment_score_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'score_id',v_score_id,
    'criteria_item_id',p_criteria_item_id,
    'self_score',v_self_score,
    'external_score',p_external_score
  );
end;
$function$;

create or replace function public.qlcl_close_external_assessment_v1(
  p_external_record_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_record public.records%rowtype;
  v_event public.external_assessment_events%rowtype;
  v_reason text := trim(coalesce(p_reason,''));
  v_score_count integer := 0;
  v_now timestamptz := now();
begin
  if p_external_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu hồ sơ đánh giá ngoài hoặc người chốt';
  end if;
  if v_reason='' then
    raise exception 'Kết luận đối chiếu là bắt buộc';
  end if;

  select r.* into v_record
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_external_record_id
    and r.record_type='EXTERNAL_ASSESSMENT'
    and r.lifecycle_status='ACTIVE'
    and p.user_id=p_actor_user_id
    and p.is_active=true
  for update of r;

  if not found then
    raise exception 'Không tìm thấy đánh giá ngoài hoạt động hoặc ngoài phạm vi tổ chức';
  end if;

  select * into v_event
  from public.external_assessment_events
  where record_id=p_external_record_id;

  if not found then
    raise exception 'Thiếu dữ liệu đợt đánh giá ngoài';
  end if;

  if not exists (
    select 1 from public.record_links
    where source_record_id=p_external_record_id
      and relation_type='COMPARED_WITH_SELF'
  ) then
    raise exception 'Chưa chọn đợt tự đánh giá để đối chiếu';
  end if;

  select count(*) into v_score_count
  from public.external_assessment_scores
  where external_assessment_event_id=v_event.id;

  if v_score_count < 1 then
    raise exception 'Chưa nhập điểm đánh giá ngoài';
  end if;

  update public.records
  set lifecycle_status='CLOSED',
      closed_at=v_now,
      updated_at=v_now
  where id=p_external_record_id
    and lifecycle_status='ACTIVE';

  if not found then
    raise exception 'Trạng thái hồ sơ đã thay đổi. Vui lòng tải lại';
  end if;

  update public.external_assessment_events
  set workflow_status='CLOSED'
  where id=v_event.id;

  insert into public.record_status_history(
    record_id,old_status,new_status,changed_by,reason
  ) values (
    p_external_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,v_reason
  );

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_external_record_id,'external_assessment_events',v_event.id,
    'EXTERNAL_ASSESSMENT_CLOSE_COMPARISON',
    jsonb_build_object(
      'lifecycle_status',v_record.lifecycle_status,
      'event_workflow_status',v_event.workflow_status
    ),
    jsonb_build_object(
      'lifecycle_status','CLOSED',
      'event_workflow_status','CLOSED',
      'compared_scores',v_score_count
    ),
    v_reason,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_close_external_assessment_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'lifecycle_status','CLOSED',
    'workflow_status','CLOSED',
    'compared_scores',v_score_count,
    'closed_at',v_now
  );
end;
$function$;

revoke all on function public.qlcl_link_external_assessment_self_v1(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.qlcl_link_external_assessment_self_v1(uuid,uuid,uuid)
  to service_role;

revoke all on function public.qlcl_save_external_assessment_score_v1(uuid,uuid,uuid,numeric,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_save_external_assessment_score_v1(uuid,uuid,uuid,numeric,text)
  to service_role;

revoke all on function public.qlcl_close_external_assessment_v1(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_close_external_assessment_v1(uuid,uuid,text)
  to service_role;
