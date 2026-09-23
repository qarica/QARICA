-- QARICA record lifecycle organization/domain hardening V2.
create or replace function public.qlcl_change_record_lifecycle_v1(
  p_record_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_record public.records%rowtype;
  v_actor public.profiles%rowtype;
  v_action text := upper(trim(coalesce(p_action,'')));
  v_target text;
  v_now timestamptz := now();
begin
  if p_actor_user_id is null then raise exception 'Thiếu người thực hiện.'; end if;
  if v_action not in ('CANCEL','ARCHIVE') then raise exception 'Thao tác vòng đời hồ sơ không hợp lệ.'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Vui lòng nhập lý do rõ ràng.'; end if;

  select * into v_actor
  from public.profiles
  where user_id=p_actor_user_id and is_active=true;
  if not found or v_actor.organization_id is null then
    raise exception 'Tài khoản không hợp lệ hoặc chưa gắn tổ chức.';
  end if;

  select * into v_record
  from public.records
  where id=p_record_id
  for update;
  if not found then raise exception 'Không tìm thấy hồ sơ.'; end if;
  if v_record.organization_id <> v_actor.organization_id then
    raise exception 'Hồ sơ không thuộc tổ chức hiện tại.';
  end if;

  if v_action='CANCEL' then
    if v_record.lifecycle_status in ('CANCELLED','ARCHIVED','RETIRED','INACTIVE') then
      raise exception 'Hồ sơ đã ngưng hoạt động.';
    end if;
    if v_record.lifecycle_status='CLOSED' then
      raise exception 'Hồ sơ đã đóng; không thể hủy.';
    end if;
    v_target:='CANCELLED';

    if v_record.record_type='ACTION' then
      update public.actions set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;
    elsif v_record.record_type='PROGRAM' then
      update public.work_programs set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;
    elsif v_record.record_type='REPORT' then
      update public.reporting_obligations set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;
    elsif v_record.record_type='MONITORING' then
      update public.monitoring_rounds set workflow_status='CANCELLED' where record_id=p_record_id;
    elsif v_record.record_type='FINDING' then
      update public.findings set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;
    elsif v_record.record_type='CAPA' then
      update public.capas set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;
    elsif v_record.record_type='INCIDENT' then
      update public.incidents set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;
    elsif v_record.record_type='AUDIT' then
      update public.audits set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;
    elsif v_record.record_type='FEEDBACK' then
      update public.feedback_records set workflow_status='CANCELLED' where record_id=p_record_id;
    elsif v_record.record_type='DIRECTIVE' then
      update public.external_directives set workflow_status='CANCELLED',updated_at=v_now where record_id=p_record_id;
    end if;
  else
    if v_record.lifecycle_status='ARCHIVED' then
      return jsonb_build_object('ok',true,'status','ARCHIVED','idempotent',true);
    end if;
    v_target:='ARCHIVED';
    if v_record.record_type='PROGRAM' then
      update public.work_programs set workflow_status='ARCHIVED',updated_at=v_now where record_id=p_record_id;
    end if;
  end if;

  update public.records
  set lifecycle_status=v_target,
      closed_at=case when v_action='CANCEL' then v_now else v_record.closed_at end,
      updated_at=v_now
  where id=p_record_id
    and organization_id=v_actor.organization_id;

  if not found then raise exception 'Hồ sơ đã thay đổi hoặc ngoài phạm vi tổ chức.'; end if;

  insert into public.record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_record_id,v_record.lifecycle_status,v_target,p_actor_user_id,trim(p_reason));

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_record_id,'records',p_record_id,
    case when v_action='CANCEL' then 'CANCEL_RECORD' else 'ARCHIVE_RECORD' end,
    jsonb_build_object('lifecycle_status',v_record.lifecycle_status),
    jsonb_build_object('lifecycle_status',v_target),
    trim(p_reason),
    jsonb_build_object(
      'source','qlcl-ui',
      'record_type',v_record.record_type,
      'organization_id',v_actor.organization_id,
      'transaction','qlcl_change_record_lifecycle_v1'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'status',v_target,
    'old_status',v_record.lifecycle_status,
    'record_type',v_record.record_type
  );
end;
$function$;

revoke all on function public.qlcl_change_record_lifecycle_v1(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_change_record_lifecycle_v1(uuid,uuid,text,text)
  to service_role;
