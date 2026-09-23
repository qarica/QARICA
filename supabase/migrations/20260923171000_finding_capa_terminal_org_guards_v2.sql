-- QARICA Finding/CAPA terminal workflow organization hardening V2.

create or replace function public.qlcl_accept_and_close_finding_v1(
  p_finding_record_id uuid,
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
  v_finding public.findings%rowtype;
  v_verification_no integer;
  v_now timestamptz := now();
begin
  if p_finding_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu Finding hoặc người xác minh.';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'Nhận xét xác minh là bắt buộc.';
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
    raise exception 'Không tìm thấy Finding hoạt động hoặc ngoài phạm vi tổ chức.';
  end if;

  select * into v_finding
  from public.findings
  where record_id=p_finding_record_id
  for update;

  if not found then raise exception 'Không tìm thấy dữ liệu Finding.'; end if;
  if v_finding.workflow_status <> 'VERIFYING' then
    raise exception 'Finding chưa ở bước xác minh.';
  end if;

  select coalesce(max(verification_no),0)+1 into v_verification_no
  from public.finding_verifications
  where finding_id=v_finding.id;

  insert into public.finding_verifications(
    finding_id,verification_no,reviewer_user_id,result,comment
  ) values (
    v_finding.id,v_verification_no,p_actor_user_id,'ACCEPTED',trim(p_reason)
  );

  update public.findings
  set workflow_status='CLOSED',
      confirmed_by=p_actor_user_id,
      confirmed_at=v_now,
      updated_at=v_now
  where id=v_finding.id
    and workflow_status='VERIFYING';
  if not found then raise exception 'Trạng thái Finding đã thay đổi. Vui lòng tải lại.'; end if;

  update public.records
  set lifecycle_status='CLOSED',closed_at=v_now,updated_at=v_now
  where id=p_finding_record_id
    and organization_id=v_record.organization_id
    and lifecycle_status='ACTIVE';
  if not found then raise exception 'Trạng thái hồ sơ Finding đã thay đổi. Vui lòng tải lại.'; end if;

  insert into public.record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_finding_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,trim(p_reason));

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_finding_record_id,'findings',v_finding.id,'FINDING_ACCEPT',
    jsonb_build_object('workflow_status',v_finding.workflow_status),
    jsonb_build_object('workflow_status','CLOSED','verification_no',v_verification_no),
    trim(p_reason),
    jsonb_build_object(
      'source','qlcl-ui',
      'organization_id',v_record.organization_id,
      'transaction','qlcl_accept_and_close_finding_v1'
    )
  );

  return jsonb_build_object('ok',true,'status','CLOSED','verification_no',v_verification_no);
end;
$function$;

create or replace function public.qlcl_close_capa_v1(
  p_capa_record_id uuid,
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
  v_capa public.capas%rowtype;
  v_reason text;
  v_now timestamptz := now();
begin
  if p_capa_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu CAPA hoặc người đóng hồ sơ.';
  end if;
  v_reason := coalesce(nullif(trim(p_reason),''),'CAPA đã được xác nhận hiệu lực.');

  select r.* into v_record
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_capa_record_id
    and r.record_type='CAPA'
    and r.lifecycle_status='ACTIVE'
    and p.user_id=p_actor_user_id
    and p.is_active=true
  for update of r;

  if not found then
    raise exception 'Không tìm thấy CAPA hoạt động hoặc ngoài phạm vi tổ chức.';
  end if;

  select * into v_capa
  from public.capas
  where record_id=p_capa_record_id
  for update;

  if not found then raise exception 'Không tìm thấy dữ liệu CAPA.'; end if;
  if v_capa.workflow_status <> 'EFFECTIVE' then
    raise exception 'Chỉ CAPA đã xác nhận có hiệu lực mới được đóng.';
  end if;

  update public.capas
  set workflow_status='CLOSED',closed_at=v_now,updated_at=v_now
  where id=v_capa.id
    and workflow_status='EFFECTIVE';
  if not found then raise exception 'Trạng thái CAPA đã thay đổi. Vui lòng tải lại.'; end if;

  update public.records
  set lifecycle_status='CLOSED',closed_at=v_now,updated_at=v_now
  where id=p_capa_record_id
    and organization_id=v_record.organization_id
    and lifecycle_status='ACTIVE';
  if not found then raise exception 'Trạng thái hồ sơ CAPA đã thay đổi. Vui lòng tải lại.'; end if;

  insert into public.record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_capa_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,v_reason);

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_capa_record_id,'capas',v_capa.id,'CAPA_CLOSE',
    jsonb_build_object('workflow_status',v_capa.workflow_status),
    jsonb_build_object('workflow_status','CLOSED'),
    v_reason,
    jsonb_build_object(
      'source','qlcl-ui',
      'organization_id',v_record.organization_id,
      'transaction','qlcl_close_capa_v1'
    )
  );

  return jsonb_build_object('ok',true,'status','CLOSED');
end;
$function$;

create or replace function public.qlcl_escalate_finding_to_capa_v1(
  p_finding_record_id uuid,
  p_actor_user_id uuid,
  p_priority text,
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
  v_verification_no integer;
  v_capa_code text;
  v_capa_record_id uuid;
  v_capa_id uuid;
  v_now timestamptz := now();
begin
  if p_finding_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu Finding hoặc người xác minh.';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'Nhận xét xác minh là bắt buộc.';
  end if;
  if p_priority not in ('NORMAL','HIGH','URGENT','CRITICAL') then
    raise exception 'Mức ưu tiên CAPA không hợp lệ.';
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
    raise exception 'Không tìm thấy Finding hoạt động hoặc ngoài phạm vi tổ chức.';
  end if;

  select * into v_finding
  from public.findings
  where record_id=p_finding_record_id
  for update;

  if not found then raise exception 'Không tìm thấy dữ liệu Finding.'; end if;
  if v_finding.workflow_status <> 'VERIFYING' then
    raise exception 'Finding chưa ở bước xác minh để chuyển CAPA.';
  end if;

  if exists (
    select 1
    from public.record_links
    where source_record_id=p_finding_record_id
      and relation_type='ESCALATED_TO_CAPA'
  ) then
    raise exception 'Finding đã được chuyển thành CAPA trước đó.';
  end if;

  select coalesce(max(verification_no),0)+1 into v_verification_no
  from public.finding_verifications
  where finding_id=v_finding.id;

  select public.next_record_code(v_record.organization_id,'CAPA',v_record.work_year)
  into v_capa_code;
  if v_capa_code is null then
    raise exception 'Không cấp được mã CAPA.';
  end if;

  insert into public.finding_verifications(
    finding_id,verification_no,reviewer_user_id,result,comment
  ) values (
    v_finding.id,v_verification_no,p_actor_user_id,'ESCALATE_CAPA',trim(p_reason)
  );

  insert into public.records(
    organization_id,record_type,record_code,title,work_year,
    owner_department_id,owner_user_id,lifecycle_status,created_by
  ) values (
    v_record.organization_id,
    'CAPA',
    v_capa_code,
    'CAPA từ '||v_record.record_code||': '||v_record.title,
    v_record.work_year,
    coalesce(v_finding.lead_department_id,v_record.owner_department_id),
    coalesce(v_finding.owner_user_id,v_record.owner_user_id),
    'ACTIVE',
    p_actor_user_id
  ) returning id into v_capa_record_id;

  insert into public.capas(
    record_id,problem_statement,priority,immediate_correction,
    lead_department_id,owner_user_id,workflow_status
  ) values (
    v_capa_record_id,
    v_finding.description,
    p_priority,
    v_finding.immediate_action,
    coalesce(v_finding.lead_department_id,v_record.owner_department_id),
    coalesce(v_finding.owner_user_id,v_record.owner_user_id),
    'DRAFT'
  ) returning id into v_capa_id;

  insert into public.record_links(
    source_record_id,target_record_id,relation_type,metadata,created_by
  ) values (
    p_finding_record_id,
    v_capa_record_id,
    'ESCALATED_TO_CAPA',
    jsonb_build_object('finding_id',v_finding.id,'verification_no',v_verification_no),
    p_actor_user_id
  );

  update public.findings
  set workflow_status='ESCALATED_TO_CAPA',updated_at=v_now
  where id=v_finding.id
    and workflow_status='VERIFYING';
  if not found then raise exception 'Trạng thái Finding đã thay đổi. Vui lòng tải lại.'; end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_finding_record_id,'findings',v_finding.id,'FINDING_ESCALATE_CAPA',
    jsonb_build_object('workflow_status',v_finding.workflow_status),
    jsonb_build_object('workflow_status','ESCALATED_TO_CAPA','capa_record_id',v_capa_record_id),
    trim(p_reason),
    jsonb_build_object(
      'source','qlcl-ui',
      'organization_id',v_record.organization_id,
      'transaction','qlcl_escalate_finding_to_capa_v1'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'status','ESCALATED_TO_CAPA',
    'capa_record_id',v_capa_record_id,
    'capa_id',v_capa_id,
    'capa_code',v_capa_code,
    'verification_no',v_verification_no
  );
end;
$function$;

revoke all on function public.qlcl_accept_and_close_finding_v1(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_accept_and_close_finding_v1(uuid,uuid,text)
  to service_role;

revoke all on function public.qlcl_close_capa_v1(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_close_capa_v1(uuid,uuid,text)
  to service_role;

revoke all on function public.qlcl_escalate_finding_to_capa_v1(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_escalate_finding_to_capa_v1(uuid,uuid,text,text)
  to service_role;
