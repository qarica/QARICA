-- QARICA FMEA non-terminal workflow atomic transition V1.
create or replace function public.qlcl_transition_fmea_v1(
  p_fmea_record_id uuid,
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
  v_study public.fmea_studies%rowtype;
  v_command text := upper(trim(coalesce(p_command,'')));
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_next text;
  v_now timestamptz := now();
  v_step_count integer := 0;
  v_mode_count integer := 0;
  v_baseline_count integer := 0;
  v_high_count integer := 0;
  v_linked_high_count integer := 0;
  v_incomplete_action_count integer := 0;
  v_evidence_count integer := 0;
begin
  if p_fmea_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu FMEA hoặc người thao tác';
  end if;
  if v_command not in ('SUBMIT','APPROVE','REQUEST_RESIDUAL_REVIEW') then
    raise exception 'Thao tác FMEA không hợp lệ';
  end if;

  select r.* into v_record
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_fmea_record_id
    and r.record_type='FMEA'
    and p.user_id=p_actor_user_id
    and p.is_active=true
    and r.lifecycle_status='ACTIVE'
  for update of r;

  if not found then
    raise exception 'Không tìm thấy FMEA hoạt động hoặc ngoài phạm vi tổ chức';
  end if;

  select * into v_study
  from public.fmea_studies
  where record_id=p_fmea_record_id
  for update;

  if not found then
    raise exception 'Không tìm thấy nghiên cứu FMEA';
  end if;

  if v_command='SUBMIT' then
    if v_study.workflow_status <> 'DRAFT' then
      raise exception 'Chỉ FMEA nháp mới được gửi phê duyệt';
    end if;
    if v_study.scoring_model_version_id is null then
      raise exception 'Cần mô hình chấm điểm đã phát hành';
    end if;

    select count(*) into v_step_count
    from public.fmea_process_steps
    where fmea_study_id=v_study.id;

    if v_step_count < 1 then
      raise exception 'Cần ít nhất một bước quy trình';
    end if;

    select count(*) into v_mode_count
    from public.fmea_failure_modes fm
    join public.fmea_process_steps ps on ps.id=fm.process_step_id
    where ps.fmea_study_id=v_study.id;

    if v_mode_count < 1 then
      raise exception 'Cần ít nhất một failure mode';
    end if;

    select count(distinct fma.failure_mode_id) into v_baseline_count
    from public.fmea_mode_assessments fma
    join public.fmea_failure_modes fm on fm.id=fma.failure_mode_id
    join public.fmea_process_steps ps on ps.id=fm.process_step_id
    where ps.fmea_study_id=v_study.id
      and fma.assessment_type='BASELINE';

    if v_baseline_count < v_mode_count then
      raise exception 'Còn % failure mode chưa có baseline S/O/D/RPN', v_mode_count-v_baseline_count;
    end if;

    v_next := 'PENDING_APPROVAL';

  elsif v_command='APPROVE' then
    if v_study.workflow_status <> 'PENDING_APPROVAL' then
      raise exception 'FMEA chưa ở bước chờ phê duyệt';
    end if;
    v_next := 'IN_PROGRESS';

  elsif v_command='REQUEST_RESIDUAL_REVIEW' then
    if v_study.workflow_status <> 'IN_PROGRESS' then
      raise exception 'FMEA chưa ở bước triển khai';
    end if;

    with high_modes as (
      select fm.id
      from public.fmea_failure_modes fm
      join public.fmea_process_steps ps on ps.id=fm.process_step_id
      where ps.fmea_study_id=v_study.id
        and fm.is_high_priority=true
    ), valid_links as (
      select distinct l.failure_mode_id,l.action_record_id
      from public.fmea_failure_mode_action_links l
      join high_modes hm on hm.id=l.failure_mode_id
      join public.record_links rl
        on rl.source_record_id=p_fmea_record_id
       and rl.target_record_id=l.action_record_id
       and rl.relation_type='HAS_ACTION'
    )
    select
      (select count(*) from high_modes),
      (select count(distinct failure_mode_id) from valid_links),
      (select count(distinct vl.action_record_id)
       from valid_links vl
       join public.actions a on a.record_id=vl.action_record_id
       where a.workflow_status not in ('COMPLETED','CANCELLED','NOT_APPLICABLE'))
    into v_high_count,v_linked_high_count,v_incomplete_action_count;

    if v_linked_high_count < v_high_count then
      raise exception 'Còn % failure mode ưu tiên cao chưa có Action riêng', v_high_count-v_linked_high_count;
    end if;
    if v_incomplete_action_count > 0 then
      raise exception 'Còn % Action của failure mode ưu tiên cao chưa hoàn thành', v_incomplete_action_count;
    end if;

    select count(*) into v_evidence_count
    from public.evidence_links
    where record_id=p_fmea_record_id;

    if v_evidence_count < 1 then
      raise exception 'Cần minh chứng thử nghiệm/can thiệp trước khi re-score';
    end if;

    v_next := 'RESIDUAL_REVIEW';
  end if;

  update public.fmea_studies
  set workflow_status=v_next,
      approved_at=case when v_command='APPROVE' then v_now else approved_at end,
      updated_at=v_now
  where id=v_study.id
    and workflow_status=v_study.workflow_status;

  if not found then
    raise exception 'Trạng thái FMEA đã thay đổi. Vui lòng tải lại';
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_fmea_record_id,'fmea_studies',v_study.id,
    'FMEA_'||v_command,
    jsonb_build_object('workflow_status',v_study.workflow_status),
    jsonb_build_object(
      'workflow_status',v_next,
      'step_count',v_step_count,
      'failure_mode_count',v_mode_count,
      'baseline_count',v_baseline_count,
      'high_priority_count',v_high_count,
      'linked_high_priority_count',v_linked_high_count,
      'incomplete_action_count',v_incomplete_action_count,
      'evidence_count',v_evidence_count
    ),
    v_reason,
    jsonb_build_object(
      'source','qlcl-ui',
      'transaction','qlcl_transition_fmea_v1',
      'method',v_study.method
    )
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status',v_next,
    'step_count',v_step_count,
    'failure_mode_count',v_mode_count,
    'baseline_count',v_baseline_count,
    'high_priority_count',v_high_count,
    'linked_high_priority_count',v_linked_high_count,
    'incomplete_action_count',v_incomplete_action_count,
    'evidence_count',v_evidence_count
  );
end;
$function$;

revoke all on function public.qlcl_transition_fmea_v1(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_transition_fmea_v1(uuid,uuid,text,text)
  to service_role;
