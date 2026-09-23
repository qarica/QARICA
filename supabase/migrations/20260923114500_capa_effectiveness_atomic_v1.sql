-- QARICA CAPA effectiveness atomic transactions V1.

create or replace function public.qlcl_request_capa_effectiveness_v1(
  p_capa_record_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_capa public.capas%rowtype;
  v_now timestamptz := now();
  v_corrective integer := 0;
  v_preventive integer := 0;
  v_incomplete integer := 0;
  v_evidence integer := 0;
begin
  if p_capa_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu CAPA hoặc người thao tác';
  end if;

  select c.* into v_capa
  from public.capas c
  join public.records r on r.id=c.record_id
  join public.profiles p on p.organization_id=r.organization_id
  where c.record_id=p_capa_record_id
    and p.user_id=p_actor_user_id
    and p.is_active=true
    and r.lifecycle_status='ACTIVE'
  for update of c;

  if not found then
    raise exception 'Không tìm thấy CAPA hoạt động hoặc ngoài phạm vi tổ chức';
  end if;
  if v_capa.workflow_status <> 'IN_PROGRESS' then
    raise exception 'CAPA chưa ở bước triển khai';
  end if;
  if nullif(trim(coalesce(v_capa.required_resources,'')),'') is null then
    raise exception 'CAPA chưa khai báo nguồn lực cần';
  end if;

  select
    count(*) filter (where upper(coalesce(cal.action_type,''))='CORRECTIVE'),
    count(*) filter (where upper(coalesce(cal.action_type,''))='PREVENTIVE'),
    count(*) filter (where a.workflow_status not in ('COMPLETED','CANCELLED','NOT_APPLICABLE'))
  into v_corrective,v_preventive,v_incomplete
  from public.capa_action_links cal
  join public.actions a on a.id=cal.action_id
  where cal.capa_id=v_capa.id;

  if v_corrective < 1 then raise exception 'CAPA thiếu Corrective Action'; end if;
  if v_preventive < 1 then raise exception 'CAPA thiếu Preventive Action'; end if;
  if (v_corrective + v_preventive) < 1 then raise exception 'CAPA chưa có Action'; end if;
  if v_incomplete > 0 then raise exception 'CAPA còn % Action chưa hoàn tất', v_incomplete; end if;

  select count(*) into v_evidence
  from public.evidence_links
  where record_id=p_capa_record_id;

  if v_evidence < 1 then
    raise exception 'CAPA chưa có minh chứng';
  end if;

  update public.capas
  set workflow_status='EFFECTIVENESS_REVIEW',
      updated_at=v_now
  where id=v_capa.id
    and workflow_status='IN_PROGRESS';

  if not found then
    raise exception 'Trạng thái CAPA đã thay đổi. Vui lòng tải lại';
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_capa_record_id,'capas',v_capa.id,
    'CAPA_REQUEST_EFFECTIVENESS',
    jsonb_build_object('workflow_status','IN_PROGRESS'),
    jsonb_build_object(
      'workflow_status','EFFECTIVENESS_REVIEW',
      'corrective_count',v_corrective,
      'preventive_count',v_preventive,
      'incomplete_action_count',v_incomplete,
      'evidence_count',v_evidence
    ),
    'CAPA đủ điều kiện chuyển sang đánh giá hiệu lực.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_request_capa_effectiveness_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status','EFFECTIVENESS_REVIEW',
    'corrective_count',v_corrective,
    'preventive_count',v_preventive,
    'incomplete_action_count',v_incomplete,
    'evidence_count',v_evidence
  );
end;
$function$;

create or replace function public.qlcl_review_capa_effectiveness_v1(
  p_capa_record_id uuid,
  p_actor_user_id uuid,
  p_result text,
  p_evaluation_method text,
  p_target_description text,
  p_actual_result text,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_capa public.capas%rowtype;
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'Asia/Ho_Chi_Minh')::date;
  v_result text := upper(trim(coalesce(p_result,'')));
  v_method text := trim(coalesce(p_evaluation_method,''));
  v_target text := trim(coalesce(p_target_description,''));
  v_actual text := trim(coalesce(p_actual_result,''));
  v_comment text := nullif(trim(coalesce(p_comment,'')),'');
  v_review_no integer := 1;
  v_review_id uuid;
  v_new_status text;
begin
  if p_capa_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu CAPA hoặc người đánh giá';
  end if;
  if v_result not in ('EFFECTIVE','PARTIALLY_EFFECTIVE','INEFFECTIVE') then
    raise exception 'Kết luận hiệu lực không hợp lệ';
  end if;
  if v_method='' or v_target='' or v_actual='' then
    raise exception 'Cần đủ phương pháp, mục tiêu và kết quả thực tế';
  end if;

  select c.* into v_capa
  from public.capas c
  join public.records r on r.id=c.record_id
  join public.profiles p on p.organization_id=r.organization_id
  where c.record_id=p_capa_record_id
    and p.user_id=p_actor_user_id
    and p.is_active=true
    and r.lifecycle_status='ACTIVE'
  for update of c;

  if not found then
    raise exception 'Không tìm thấy CAPA hoạt động hoặc ngoài phạm vi tổ chức';
  end if;
  if v_capa.workflow_status <> 'EFFECTIVENESS_REVIEW' then
    raise exception 'CAPA chưa đến bước đánh giá hiệu lực';
  end if;

  select coalesce(max(review_no),0)+1 into v_review_no
  from public.capa_effectiveness_reviews
  where capa_id=v_capa.id;

  insert into public.capa_effectiveness_reviews(
    capa_id,review_no,planned_review_date,actual_review_date,
    evaluation_method,target_description,actual_result,result,comment,reviewed_by
  ) values (
    v_capa.id,v_review_no,v_capa.effectiveness_due_date,v_today,
    v_method,v_target,v_actual,v_result,v_comment,p_actor_user_id
  )
  returning id into v_review_id;

  v_new_status := case when v_result='EFFECTIVE' then 'EFFECTIVE' else 'IN_PROGRESS' end;

  update public.capas
  set workflow_status=v_new_status,
      updated_at=v_now
  where id=v_capa.id
    and workflow_status='EFFECTIVENESS_REVIEW';

  if not found then
    raise exception 'Trạng thái CAPA đã thay đổi. Vui lòng tải lại';
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_capa_record_id,'capas',v_capa.id,
    'CAPA_REVIEW_EFFECTIVENESS',
    jsonb_build_object('workflow_status','EFFECTIVENESS_REVIEW'),
    jsonb_build_object(
      'workflow_status',v_new_status,
      'effectiveness_result',v_result,
      'review_id',v_review_id,
      'review_no',v_review_no
    ),
    v_comment,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_review_capa_effectiveness_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status',v_new_status,
    'result',v_result,
    'review_id',v_review_id,
    'review_no',v_review_no,
    'reviewed_at',v_now
  );
end;
$function$;

revoke all on function public.qlcl_request_capa_effectiveness_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.qlcl_request_capa_effectiveness_v1(uuid,uuid)
  to service_role;

revoke all on function public.qlcl_review_capa_effectiveness_v1(uuid,uuid,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_review_capa_effectiveness_v1(uuid,uuid,text,text,text,text,text)
  to service_role;
