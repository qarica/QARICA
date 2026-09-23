-- QARICA Risk Register non-terminal atomic transactions V1.

create or replace function public.qlcl_assess_risk_v1(
  p_risk_record_id uuid,
  p_actor_user_id uuid,
  p_severity integer,
  p_likelihood integer,
  p_rationale text,
  p_evidence_summary text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_record public.records%rowtype;
  v_risk public.risks%rowtype;
  v_matrix public.risk_matrix_versions%rowtype;
  v_cell public.risk_matrix_cells%rowtype;
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'Asia/Ho_Chi_Minh')::date;
  v_assessment_type text;
  v_new_status text;
  v_assessment_id uuid;
begin
  if p_risk_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu rủi ro hoặc người đánh giá';
  end if;

  select r.* into v_record
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_risk_record_id
    and r.record_type='RISK'
    and r.lifecycle_status='ACTIVE'
    and p.user_id=p_actor_user_id
    and p.is_active=true
  for update of r;

  if not found then
    raise exception 'Không tìm thấy rủi ro hoạt động hoặc ngoài phạm vi tổ chức';
  end if;

  select * into v_risk
  from public.risks
  where record_id=p_risk_record_id
  for update;

  if not found then
    raise exception 'Không tìm thấy dữ liệu Risk Register';
  end if;
  if v_risk.workflow_status not in ('IDENTIFIED','ASSESSED','REASSESSMENT','MONITORING') then
    raise exception 'Rủi ro không ở trạng thái có thể đánh giá';
  end if;

  select * into v_matrix
  from public.risk_matrix_versions
  where status='PUBLISHED'
  order by
    case
      when (effective_from is null or effective_from <= v_today)
       and (effective_to is null or effective_to >= v_today)
      then 0 else 1
    end,
    published_at desc nulls last,
    version_no desc
  limit 1;

  if not found then
    raise exception 'Chưa có Risk Matrix đã phát hành';
  end if;
  if p_severity is null or p_severity < 1 or p_severity > v_matrix.severity_scale_max then
    raise exception 'Severity phải từ 1 đến %', v_matrix.severity_scale_max;
  end if;
  if p_likelihood is null or p_likelihood < 1 or p_likelihood > v_matrix.likelihood_scale_max then
    raise exception 'Likelihood phải từ 1 đến %', v_matrix.likelihood_scale_max;
  end if;

  select * into v_cell
  from public.risk_matrix_cells
  where matrix_version_id=v_matrix.id
    and severity_value=p_severity
    and likelihood_value=p_likelihood;

  if not found then
    raise exception 'Risk Matrix chưa cấu hình ô Severity × Likelihood này';
  end if;

  v_assessment_type := case
    when v_risk.workflow_status='IDENTIFIED' then 'INITIAL'
    when v_risk.workflow_status='REASSESSMENT' then 'POST_TREATMENT'
    when v_risk.workflow_status='MONITORING' then 'PERIODIC_REVIEW'
    else 'CURRENT'
  end;

  v_new_status := case
    when v_risk.workflow_status in ('REASSESSMENT','MONITORING') then 'MONITORING'
    else 'ASSESSED'
  end;

  insert into public.risk_assessments(
    risk_id,assessment_date,assessment_year,assessment_type,matrix_version_id,
    severity,likelihood,calculated_score,calculated_level,assessed_by,
    rationale,evidence_summary
  ) values (
    v_risk.id,v_today,v_record.work_year,v_assessment_type,v_matrix.id,
    p_severity,p_likelihood,v_cell.score,v_cell.risk_level,p_actor_user_id,
    nullif(trim(coalesce(p_rationale,'')),''),
    nullif(trim(coalesce(p_evidence_summary,'')),'')
  )
  returning id into v_assessment_id;

  update public.risks
  set workflow_status=v_new_status,
      updated_at=v_now
  where id=v_risk.id
    and workflow_status=v_risk.workflow_status;

  if not found then
    raise exception 'Trạng thái rủi ro đã thay đổi. Vui lòng tải lại';
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_risk_record_id,'risks',v_risk.id,'RISK_ASSESS',
    jsonb_build_object('workflow_status',v_risk.workflow_status),
    jsonb_build_object(
      'workflow_status',v_new_status,
      'assessment_id',v_assessment_id,
      'assessment_type',v_assessment_type,
      'matrix_version_id',v_matrix.id,
      'severity',p_severity,
      'likelihood',p_likelihood,
      'score',v_cell.score,
      'risk_level',v_cell.risk_level
    ),
    nullif(trim(coalesce(p_rationale,'')),''),
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_assess_risk_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status',v_new_status,
    'assessment_id',v_assessment_id,
    'assessment_type',v_assessment_type,
    'matrix_name',v_matrix.name,
    'matrix_version_no',v_matrix.version_no,
    'score',v_cell.score,
    'risk_level',v_cell.risk_level
  );
end;
$function$;

create or replace function public.qlcl_transition_risk_v1(
  p_risk_record_id uuid,
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
  v_risk public.risks%rowtype;
  v_command text := upper(trim(coalesce(p_command,'')));
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_now timestamptz := now();
  v_new_status text;
  v_active_actions integer := 0;
  v_incomplete_actions integer := 0;
  v_evidence integer := 0;
begin
  if p_risk_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu rủi ro hoặc người thao tác';
  end if;
  if v_command not in ('REQUIRE_TREATMENT','START_TREATMENT','REQUEST_REASSESSMENT') then
    raise exception 'Thao tác Risk Register không hợp lệ';
  end if;

  select r.* into v_record
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_risk_record_id
    and r.record_type='RISK'
    and r.lifecycle_status='ACTIVE'
    and p.user_id=p_actor_user_id
    and p.is_active=true
  for update of r;

  if not found then
    raise exception 'Không tìm thấy rủi ro hoạt động hoặc ngoài phạm vi tổ chức';
  end if;

  select * into v_risk
  from public.risks
  where record_id=p_risk_record_id
  for update;

  if not found then
    raise exception 'Không tìm thấy dữ liệu Risk Register';
  end if;

  if v_command='REQUIRE_TREATMENT' then
    if v_risk.workflow_status not in ('ASSESSED','MONITORING','RISK_ACCEPTED') then
      raise exception 'Rủi ro chưa ở bước có thể yêu cầu xử lý';
    end if;
    v_new_status := 'TREATMENT_REQUIRED';

  elsif v_command='START_TREATMENT' then
    if v_risk.workflow_status <> 'TREATMENT_REQUIRED' then
      raise exception 'Rủi ro chưa ở bước cần xử lý';
    end if;

    select
      count(*) filter (where a.workflow_status not in ('CANCELLED','NOT_APPLICABLE')),
      count(*) filter (
        where a.workflow_status not in ('CANCELLED','NOT_APPLICABLE','COMPLETED')
      )
    into v_active_actions,v_incomplete_actions
    from public.risk_action_links ral
    join public.actions a on a.id=ral.action_id
    where ral.risk_id=v_risk.id;

    if v_active_actions < 1 then
      raise exception 'Không có Action xử lý đang áp dụng';
    end if;
    v_new_status := 'IN_TREATMENT';

  elsif v_command='REQUEST_REASSESSMENT' then
    if v_risk.workflow_status <> 'IN_TREATMENT' then
      raise exception 'Rủi ro chưa ở bước đang xử lý';
    end if;

    select
      count(*) filter (where a.workflow_status not in ('CANCELLED','NOT_APPLICABLE')),
      count(*) filter (
        where a.workflow_status not in ('CANCELLED','NOT_APPLICABLE','COMPLETED')
      )
    into v_active_actions,v_incomplete_actions
    from public.risk_action_links ral
    join public.actions a on a.id=ral.action_id
    where ral.risk_id=v_risk.id;

    if v_active_actions < 1 then
      raise exception 'Không có Action xử lý đang áp dụng';
    end if;
    if v_incomplete_actions > 0 then
      raise exception 'Còn % Action chưa hoàn thành', v_incomplete_actions;
    end if;

    select count(*) into v_evidence
    from public.evidence_links
    where record_id=p_risk_record_id;

    if v_evidence < 1 then
      raise exception 'Cần ít nhất 01 minh chứng xử lý trước khi đánh giá residual risk';
    end if;
    v_new_status := 'REASSESSMENT';
  end if;

  update public.risks
  set workflow_status=v_new_status,
      updated_at=v_now
  where id=v_risk.id
    and workflow_status=v_risk.workflow_status;

  if not found then
    raise exception 'Trạng thái rủi ro đã thay đổi. Vui lòng tải lại';
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_risk_record_id,'risks',v_risk.id,'RISK_'||v_command,
    jsonb_build_object('workflow_status',v_risk.workflow_status),
    jsonb_build_object(
      'workflow_status',v_new_status,
      'active_action_count',v_active_actions,
      'incomplete_action_count',v_incomplete_actions,
      'evidence_count',v_evidence
    ),
    coalesce(v_reason,
      case
        when v_command='REQUIRE_TREATMENT' then 'Yêu cầu lập hoặc triển khai Action xử lý rủi ro.'
        when v_command='START_TREATMENT' then 'Bắt đầu triển khai xử lý rủi ro.'
        else 'Action đã hoàn thành và có minh chứng; chuyển đánh giá residual risk.'
      end
    ),
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_transition_risk_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status',v_new_status,
    'active_action_count',v_active_actions,
    'incomplete_action_count',v_incomplete_actions,
    'evidence_count',v_evidence
  );
end;
$function$;

revoke all on function public.qlcl_assess_risk_v1(uuid,uuid,integer,integer,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_assess_risk_v1(uuid,uuid,integer,integer,text,text)
  to service_role;

revoke all on function public.qlcl_transition_risk_v1(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_transition_risk_v1(uuid,uuid,text,text)
  to service_role;
