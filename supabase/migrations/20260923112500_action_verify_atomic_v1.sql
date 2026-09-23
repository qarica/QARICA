-- QARICA USER/GROUP Action verification atomic transaction V1.
create or replace function public.qlcl_verify_action_v1(
  p_action_id uuid,
  p_actor_user_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_action public.actions%rowtype;
  v_now timestamptz := now();
  v_evidence_ids uuid[];
  v_evidence_count integer := 0;
begin
  if p_action_id is null or p_actor_user_id is null then
    raise exception 'Thiếu Action hoặc người xác minh';
  end if;

  select * into v_action
  from public.actions
  where id=p_action_id
  for update;

  if not found then
    raise exception 'Không tìm thấy Action';
  end if;
  if v_action.assignment_target_type not in ('USER','GROUP') then
    raise exception 'RPC này chỉ dùng cho Action phân công cá nhân/nhóm';
  end if;
  if not exists (
    select 1
    from public.records r
    join public.profiles p on p.organization_id=r.organization_id
    where r.id=v_action.record_id
      and p.user_id=p_actor_user_id
      and p.is_active
  ) then
    raise exception 'Người xác minh không hợp lệ hoặc ngoài phạm vi tổ chức';
  end if;
  if v_action.workflow_status <> 'VERIFYING' then
    raise exception 'Action chưa ở trạng thái đang xác minh';
  end if;

  select array_agg(evidence_id), count(*)
  into v_evidence_ids, v_evidence_count
  from public.evidence_links
  where record_id=v_action.record_id;

  if coalesce(v_action.evidence_required,true) and v_evidence_count < 1 then
    raise exception 'Action chưa có minh chứng để xác minh';
  end if;

  if v_evidence_ids is not null then
    update public.evidence
    set validity_status='VALID'
    where id=any(v_evidence_ids)
      and validity_status='PENDING';
  end if;

  update public.actions
  set workflow_status='COMPLETED',
      verified_at=v_now,
      verified_by=p_actor_user_id,
      completion_note=nullif(trim(coalesce(p_note,'')),''),
      actual_end_date=(v_now at time zone 'Asia/Ho_Chi_Minh')::date,
      updated_at=v_now
  where id=p_action_id
    and workflow_status='VERIFYING';

  if not found then
    raise exception 'Trạng thái Action đã thay đổi. Vui lòng tải lại';
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,
    v_action.record_id,
    'actions',
    p_action_id,
    'ACTION_VERIFY',
    jsonb_build_object(
      'workflow_status','VERIFYING'
    ),
    jsonb_build_object(
      'workflow_status','COMPLETED',
      'evidence_count',v_evidence_count,
      'verified_at',v_now
    ),
    nullif(trim(coalesce(p_note,'')),''),
    jsonb_build_object(
      'source','qlcl-ui',
      'transaction','qlcl_verify_action_v1',
      'assignment_target_type',v_action.assignment_target_type
    )
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status','COMPLETED',
    'verified_at',v_now,
    'evidence_count',v_evidence_count
  );
end;
$function$;

revoke all on function public.qlcl_verify_action_v1(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_verify_action_v1(uuid,uuid,text)
  to service_role;
