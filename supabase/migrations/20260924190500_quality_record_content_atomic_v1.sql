-- QARICA generic quality-record content edit atomic transaction V1.
create or replace function public.qlcl_update_quality_record_content_v1(
  p_record_id uuid,
  p_actor_user_id uuid,
  p_record_type text,
  p_title text,
  p_patch jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_record public.records%rowtype;
  v_type text := upper(trim(coalesce(p_record_type,'')));
  v_title text := trim(coalesce(p_title,''));
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_now timestamptz := now();
  v_row_id uuid;
  v_status text;
  v_old jsonb;
  v_new jsonb;
begin
  if p_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu hồ sơ hoặc người chỉnh sửa';
  end if;
  if v_type not in ('FINDING','CAPA','RISK') then
    raise exception 'Loại hồ sơ không hỗ trợ chỉnh sửa nội dung';
  end if;
  if v_title = '' then
    raise exception 'Tên hồ sơ là bắt buộc';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Nội dung cập nhật không hợp lệ';
  end if;

  select r.* into v_record
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_record_id
    and r.record_type=v_type
    and p.user_id=p_actor_user_id
    and p.is_active=true
  for update of r;

  if not found then
    raise exception 'Hồ sơ không thuộc phạm vi tổ chức hiện tại hoặc tài khoản đã ngưng';
  end if;
  if v_record.lifecycle_status <> 'ACTIVE' then
    raise exception 'Hồ sơ không còn hoạt động nên không thể chỉnh sửa';
  end if;

  if v_type='FINDING' then
    select f.id,f.workflow_status,to_jsonb(f) into v_row_id,v_status,v_old
    from public.findings f
    where f.record_id=p_record_id
    for update;
    if not found then raise exception 'Không tìm thấy dữ liệu Finding'; end if;
    if v_status not in ('OPEN','ASSIGNED','IN_PROGRESS','RETURNED') then
      raise exception 'Finding đã qua giai đoạn được phép sửa nội dung nền';
    end if;

    update public.findings
    set finding_type=nullif(trim(coalesce(p_patch->>'finding_type','')),''),
        severity=nullif(trim(coalesce(p_patch->>'severity','')),''),
        identified_at=case when nullif(trim(coalesce(p_patch->>'identified_at','')),'') is null then null else (p_patch->>'identified_at')::timestamptz end,
        due_date=case when nullif(trim(coalesce(p_patch->>'due_date','')),'') is null then null else (p_patch->>'due_date')::date end,
        description=trim(coalesce(p_patch->>'description','')),
        immediate_action=nullif(trim(coalesce(p_patch->>'immediate_action','')),''),
        updated_at=v_now
    where id=v_row_id;
    if nullif(trim(coalesce(p_patch->>'description','')),'') is null then raise exception 'Mô tả phát hiện là bắt buộc'; end if;
    select to_jsonb(f) into v_new from public.findings f where f.id=v_row_id;

  elsif v_type='CAPA' then
    select c.id,c.workflow_status,to_jsonb(c) into v_row_id,v_status,v_old
    from public.capas c
    where c.record_id=p_record_id
    for update;
    if not found then raise exception 'Không tìm thấy dữ liệu CAPA'; end if;
    if v_status <> 'DRAFT' then raise exception 'CAPA chỉ được sửa nội dung nền khi còn DRAFT'; end if;
    if upper(trim(coalesce(p_patch->>'priority',''))) not in ('LOW','NORMAL','HIGH','URGENT','CRITICAL') then
      raise exception 'Mức ưu tiên CAPA không hợp lệ';
    end if;
    if nullif(trim(coalesce(p_patch->>'problem_statement','')),'') is null then
      raise exception 'Vấn đề cần CAPA là bắt buộc';
    end if;

    update public.capas
    set priority=upper(trim(p_patch->>'priority')),
        effectiveness_due_date=case when nullif(trim(coalesce(p_patch->>'effectiveness_due_date','')),'') is null then null else (p_patch->>'effectiveness_due_date')::date end,
        approval_required=coalesce((p_patch->>'approval_required')::boolean,false),
        problem_statement=trim(p_patch->>'problem_statement'),
        immediate_correction=nullif(trim(coalesce(p_patch->>'immediate_correction','')),''),
        updated_at=v_now
    where id=v_row_id;
    select to_jsonb(c) into v_new from public.capas c where c.id=v_row_id;

  else
    select rsk.id,rsk.workflow_status,to_jsonb(rsk) into v_row_id,v_status,v_old
    from public.risks rsk
    where rsk.record_id=p_record_id
    for update;
    if not found then raise exception 'Không tìm thấy dữ liệu Risk Register'; end if;
    if v_status <> 'IDENTIFIED' then
      raise exception 'Risk Register chỉ được sửa nội dung nền trước lần đánh giá đầu tiên';
    end if;
    if nullif(trim(coalesce(p_patch->>'risk_event','')),'') is null then raise exception 'Sự kiện rủi ro là bắt buộc'; end if;

    update public.risks
    set risk_event=trim(p_patch->>'risk_event'),
        cause_summary=nullif(trim(coalesce(p_patch->>'cause_summary','')),''),
        potential_consequence=nullif(trim(coalesce(p_patch->>'potential_consequence','')),''),
        process_name=nullif(trim(coalesce(p_patch->>'process_name','')),''),
        next_review_date=case when nullif(trim(coalesce(p_patch->>'next_review_date','')),'') is null then null else (p_patch->>'next_review_date')::date end,
        review_frequency=nullif(trim(coalesce(p_patch->>'review_frequency','')),''),
        updated_at=v_now
    where id=v_row_id;
    select to_jsonb(rsk) into v_new from public.risks rsk where rsk.id=v_row_id;
  end if;

  update public.records
  set title=v_title,
      updated_at=v_now
  where id=p_record_id;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_record_id,lower(v_type)||'s',v_row_id,v_type||'_CONTENT_EDIT',
    jsonb_build_object('record_title',v_record.title,'domain',v_old),
    jsonb_build_object('record_title',v_title,'domain',v_new),
    coalesce(v_reason,'Chỉnh sửa nội dung hồ sơ trong giai đoạn cho phép.'),
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_update_quality_record_content_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'record_id',p_record_id,
    'record_type',v_type,
    'row_id',v_row_id,
    'workflow_status',v_status,
    'updated_at',v_now
  );
end;
$function$;

revoke all on function public.qlcl_update_quality_record_content_v1(uuid,uuid,text,text,jsonb,text)
from public,anon,authenticated;
grant execute on function public.qlcl_update_quality_record_content_v1(uuid,uuid,text,text,jsonb,text)
to service_role;
