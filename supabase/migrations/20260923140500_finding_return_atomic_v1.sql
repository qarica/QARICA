-- QARICA Finding RETURN atomic transaction V1.
create or replace function public.qlcl_return_finding_v1(
  p_finding_record_id uuid,
  p_actor_user_id uuid,
  p_next_due_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_record public.records%rowtype;
  v_finding public.findings%rowtype;
  v_verification_no integer := 1;
  v_verification_id uuid;
  v_now timestamptz := now();
begin
  if p_finding_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu Finding hoặc người xác minh';
  end if;
  if p_next_due_date is null then
    raise exception 'Cần xác định hạn bổ sung tiếp theo';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'Nhận xét xác minh là bắt buộc';
  end if;

  select r.* into v_record
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_finding_record_id
    and r.record_type='FINDING'
    and r.lifecycle_status='ACTIVE'
    and p.user_id=p_actor_user_id
    and p.is_active=true
  for update of r;

  if not found then
    raise exception 'Không tìm thấy Finding hoạt động hoặc ngoài phạm vi tổ chức';
  end if;

  select * into v_finding
  from public.findings
  where record_id=p_finding_record_id
  for update;

  if not found then
    raise exception 'Không tìm thấy dữ liệu Finding';
  end if;
  if v_finding.workflow_status <> 'VERIFYING' then
    raise exception 'Finding chưa ở bước xác minh';
  end if;

  select coalesce(max(verification_no),0)+1
  into v_verification_no
  from public.finding_verifications
  where finding_id=v_finding.id;

  insert into public.finding_verifications(
    finding_id,verification_no,reviewer_user_id,result,comment,next_due_date
  ) values (
    v_finding.id,v_verification_no,p_actor_user_id,'RETURNED',trim(p_reason),p_next_due_date
  )
  returning id into v_verification_id;

  update public.findings
  set workflow_status='RETURNED',
      due_date=p_next_due_date,
      confirmed_by=null,
      confirmed_at=null,
      updated_at=v_now
  where id=v_finding.id
    and workflow_status='VERIFYING';

  if not found then
    raise exception 'Trạng thái Finding đã thay đổi. Vui lòng tải lại';
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_finding_record_id,'findings',v_finding.id,
    'FINDING_RETURN',
    jsonb_build_object(
      'workflow_status',v_finding.workflow_status,
      'due_date',v_finding.due_date
    ),
    jsonb_build_object(
      'workflow_status','RETURNED',
      'due_date',p_next_due_date,
      'verification_id',v_verification_id,
      'verification_no',v_verification_no
    ),
    trim(p_reason),
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_return_finding_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'status','RETURNED',
    'verification_id',v_verification_id,
    'verification_no',v_verification_no,
    'next_due_date',p_next_due_date
  );
end;
$function$;

revoke all on function public.qlcl_return_finding_v1(uuid,uuid,date,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_return_finding_v1(uuid,uuid,date,text)
  to service_role;
