-- QARICA Directive non-terminal workflow atomic transition V1.
create or replace function public.qlcl_transition_directive_v1(
  p_directive_record_id uuid,
  p_actor_user_id uuid,
  p_command text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_record public.records%rowtype;
  v_directive public.external_directives%rowtype;
  v_command text := upper(trim(coalesce(p_command,'')));
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_next text;
  v_now timestamptz := now();
  v_active_actions integer := 0;
  v_incomplete_actions integer := 0;
  v_evidence integer := 0;
begin
  if p_directive_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu yêu cầu hoặc người thao tác';
  end if;
  if v_command not in ('ASSIGN','START','SUBMIT_EVIDENCE','RETURN') then
    raise exception 'Thao tác yêu cầu không hợp lệ';
  end if;

  select r.* into v_record
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_directive_record_id
    and r.record_type='DIRECTIVE'
    and p.user_id=p_actor_user_id
    and p.is_active=true
    and r.lifecycle_status='ACTIVE'
  for update of r;

  if not found then
    raise exception 'Không tìm thấy yêu cầu hoạt động hoặc ngoài phạm vi tổ chức';
  end if;

  select * into v_directive
  from public.external_directives
  where record_id=p_directive_record_id
  for update;

  if not found then
    raise exception 'Không tìm thấy dữ liệu chỉ đạo/yêu cầu';
  end if;

  if v_command='ASSIGN' then
    if v_directive.workflow_status <> 'OPEN' then
      raise exception 'Chỉ yêu cầu mới tiếp nhận mới được phân công';
    end if;
    if v_record.owner_department_id is null or v_record.owner_user_id is null
       or nullif(trim(coalesce(v_directive.requirements,'')),'') is null then
      raise exception 'Cần đủ yêu cầu, đơn vị và người phụ trách trước khi phân công';
    end if;
    v_next := 'ASSIGNED';

  elsif v_command='START' then
    if v_directive.workflow_status <> 'ASSIGNED' then
      raise exception 'Yêu cầu chưa ở trạng thái đã phân công';
    end if;

    select count(*) into v_active_actions
    from public.directive_action_links dal
    join public.actions a on a.id=dal.action_id
    where dal.directive_id=v_directive.id
      and a.workflow_status not in ('CANCELLED','NOT_APPLICABLE');

    if v_active_actions < 1 then
      raise exception 'Cần ít nhất một Action thực hiện trước khi bắt đầu';
    end if;
    v_next := 'IN_PROGRESS';

  elsif v_command='SUBMIT_EVIDENCE' then
    if v_directive.workflow_status <> 'IN_PROGRESS' then
      raise exception 'Yêu cầu chưa ở trạng thái đang thực hiện';
    end if;

    select
      count(*) filter (where a.workflow_status not in ('CANCELLED','NOT_APPLICABLE')),
      count(*) filter (where a.workflow_status not in ('COMPLETED','CANCELLED','NOT_APPLICABLE'))
    into v_active_actions,v_incomplete_actions
    from public.directive_action_links dal
    join public.actions a on a.id=dal.action_id
    where dal.directive_id=v_directive.id;

    if v_active_actions < 1 then
      raise exception 'Yêu cầu chưa có Action áp dụng';
    end if;
    if v_incomplete_actions > 0 then
      raise exception 'Còn % Action chưa hoàn thành', v_incomplete_actions;
    end if;

    select count(*) into v_evidence
    from public.evidence_links
    where record_id=p_directive_record_id;

    if v_evidence < 1 then
      raise exception 'Cần minh chứng sản phẩm/đã gửi trước khi xác nhận';
    end if;
    v_next := 'EVIDENCE_SUBMITTED';

  elsif v_command='RETURN' then
    if v_directive.workflow_status <> 'EVIDENCE_SUBMITTED' then
      raise exception 'Yêu cầu chưa ở trạng thái chờ xác nhận';
    end if;
    if v_reason is null then
      raise exception 'Cần lý do trả lại bổ sung';
    end if;
    v_next := 'IN_PROGRESS';
  end if;

  update public.external_directives
  set workflow_status=v_next,
      updated_at=v_now
  where id=v_directive.id
    and workflow_status=v_directive.workflow_status;

  if not found then
    raise exception 'Trạng thái yêu cầu đã thay đổi. Vui lòng tải lại';
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_directive_record_id,'external_directives',v_directive.id,
    'DIRECTIVE_'||v_command,
    jsonb_build_object('workflow_status',v_directive.workflow_status),
    jsonb_build_object(
      'workflow_status',v_next,
      'active_action_count',v_active_actions,
      'incomplete_action_count',v_incomplete_actions,
      'evidence_count',v_evidence
    ),
    v_reason,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_transition_directive_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status',v_next,
    'active_action_count',v_active_actions,
    'incomplete_action_count',v_incomplete_actions,
    'evidence_count',v_evidence
  );
end;
$function$;

revoke all on function public.qlcl_transition_directive_v1(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_transition_directive_v1(uuid,uuid,text,text)
  to service_role;
