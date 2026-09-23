-- QARICA Feedback -> Finding atomic transaction V1.
create or replace function public.qlcl_create_feedback_finding_v1(
  p_feedback_record_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_due_date date,
  p_severity text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_record public.records%rowtype;
  v_feedback public.feedback_records%rowtype;
  v_now timestamptz := now();
  v_reason text := trim(coalesce(p_reason,''));
  v_severity text := upper(trim(coalesce(p_severity,'MAJOR')));
  v_code text;
  v_finding_record_id uuid;
  v_finding_id uuid;
  v_department_id uuid;
  v_owner_user_id uuid;
begin
  if p_feedback_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu phản ánh hoặc người thao tác';
  end if;
  if v_reason='' or p_due_date is null then
    raise exception 'Cần mô tả vấn đề hệ thống và hạn khắc phục';
  end if;

  select r.* into v_record
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_feedback_record_id
    and r.record_type='FEEDBACK'
    and r.lifecycle_status='ACTIVE'
    and p.user_id=p_actor_user_id
    and p.is_active=true;

  if not found then
    raise exception 'Không tìm thấy phản ánh hoạt động hoặc ngoài phạm vi tổ chức';
  end if;

  select * into v_feedback
  from public.feedback_records
  where record_id=p_feedback_record_id
  for update;

  if not found then
    raise exception 'Không tìm thấy dữ liệu phản ánh';
  end if;
  if v_feedback.workflow_status not in ('TRIAGED','COORDINATING') then
    raise exception 'Chỉ sinh Finding sau khi đã phân loại phản ánh';
  end if;

  if exists (
    select 1 from public.record_links
    where source_record_id=p_feedback_record_id
      and relation_type='GENERATED_FINDING'
  ) then
    raise exception 'Phản ánh này đã có Finding liên kết';
  end if;

  v_department_id := coalesce(v_record.owner_department_id,v_feedback.related_department_id);
  v_owner_user_id := coalesce(v_record.owner_user_id,v_feedback.owner_user_id);

  v_code := public.next_record_code(v_record.organization_id,'FINDING',v_record.work_year);

  insert into public.records(
    organization_id,record_type,record_code,title,work_year,
    owner_department_id,owner_user_id,lifecycle_status,created_by
  ) values (
    v_record.organization_id,'FINDING',v_code,
    'Finding từ '||coalesce(v_record.record_code,'Feedback')||': '||v_record.title,
    v_record.work_year,v_department_id,v_owner_user_id,'ACTIVE',p_actor_user_id
  )
  returning id into v_finding_record_id;

  insert into public.findings(
    record_id,finding_type,description,severity,lead_department_id,
    owner_user_id,identified_at,due_date,workflow_status,updated_at
  ) values (
    v_finding_record_id,'FEEDBACK_SYSTEM_ISSUE',
    v_reason||E'\nNguồn phản ánh: '||coalesce(v_feedback.description,''),
    nullif(v_severity,''),v_department_id,v_owner_user_id,v_now,p_due_date,'OPEN',v_now
  )
  returning id into v_finding_id;

  insert into public.record_links(
    source_record_id,target_record_id,relation_type,metadata,created_by
  ) values (
    p_feedback_record_id,v_finding_record_id,'GENERATED_FINDING',
    jsonb_build_object('finding_id',v_finding_id,'source','FEEDBACK'),
    p_actor_user_id
  );

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_feedback_record_id,'feedback_records',v_feedback.id,
    'FEEDBACK_CREATE_FINDING',
    jsonb_build_object(
      'finding_record_id',v_finding_record_id,
      'finding_id',v_finding_id,
      'finding_code',v_code,
      'due_date',p_due_date,
      'severity',v_severity
    ),
    v_reason,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_create_feedback_finding_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'finding_record_id',v_finding_record_id,
    'finding_id',v_finding_id,
    'finding_code',v_code
  );
end;
$function$;

revoke all on function public.qlcl_create_feedback_finding_v1(uuid,uuid,text,date,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_create_feedback_finding_v1(uuid,uuid,text,date,text)
  to service_role;
