-- FMEA/HFMEA: is_high_priority trước đây chỉ do người dùng tự tick lúc khai
-- báo failure mode (trước khi có S/O/D/RPN) — nếu quên tick, failure mode có
-- RPN cao vẫn không bị bắt buộc Action riêng/tái đánh giá residual, sai
-- nguyên tắc HFMEA (ưu tiên phải theo điểm số, không theo trí nhớ).
--
-- Tự động nâng is_high_priority=true khi RPN >= 125 (ngưỡng phổ biến trong
-- HFMEA, khoảng 1/3 cao nhất của thang 1-1000) tại thời điểm chấm BASELINE —
-- chỉ NÂNG lên, không hạ xuống nếu người dùng đã tự tick cao từ trước. Chỉ
-- áp dụng cho BASELINE (rủi ro gốc trước can thiệp), không áp dụng cho
-- RESIDUAL (rủi ro còn lại sau can thiệp không nên tự ý mở lại yêu cầu Action
-- mới chỉ vì residual RPN còn cao — việc đó do bước re-score residual quyết
-- định qua kết luận thủ công).
create or replace function public.qlcl_score_fmea_mode_v1(
  p_fmea_record_id uuid,
  p_actor_user_id uuid,
  p_failure_mode_id uuid,
  p_assessment_type text,
  p_severity integer,
  p_occurrence integer,
  p_detection integer,
  p_rationale text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_study public.fmea_studies%rowtype;
  v_mode public.fmea_failure_modes%rowtype;
  v_type text := upper(trim(coalesce(p_assessment_type,'')));
  v_assessment_id uuid;
  v_rpn integer;
  v_assessed_at timestamptz;
  v_rpn_high_threshold constant integer := 125;
begin
  if p_fmea_record_id is null or p_actor_user_id is null or p_failure_mode_id is null then
    raise exception 'Thiếu FMEA, failure mode hoặc người đánh giá';
  end if;
  if v_type not in ('BASELINE','RESIDUAL') then
    raise exception 'Loại đánh giá không hợp lệ';
  end if;
  if p_severity not between 1 and 10 or p_occurrence not between 1 and 10 or p_detection not between 1 and 10 then
    raise exception 'Severity, Occurrence và Detection phải từ 1 đến 10';
  end if;

  select s.* into v_study
  from public.fmea_studies s
  join public.records r on r.id=s.record_id
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_fmea_record_id
    and r.record_type='FMEA'
    and r.lifecycle_status='ACTIVE'
    and p.user_id=p_actor_user_id
    and p.is_active=true
  for update of s;

  if not found then
    raise exception 'Không tìm thấy FMEA hoạt động hoặc ngoài phạm vi tổ chức';
  end if;

  select fm.* into v_mode
  from public.fmea_failure_modes fm
  join public.fmea_process_steps ps on ps.id=fm.process_step_id
  where fm.id=p_failure_mode_id
    and ps.fmea_study_id=v_study.id
  for update of fm;

  if not found then
    raise exception 'Failure mode không thuộc FMEA này';
  end if;

  if v_type='BASELINE' and v_study.workflow_status<>'DRAFT' then
    raise exception 'Baseline chỉ được ghi khi FMEA còn ở trạng thái nháp';
  end if;
  if v_type='RESIDUAL' and v_study.workflow_status<>'RESIDUAL_REVIEW' then
    raise exception 'Residual score chỉ được ghi tại bước re-score residual risk';
  end if;

  insert into public.fmea_mode_assessments(
    failure_mode_id,assessment_type,scoring_model_version_id,
    severity,occurrence,detection,rationale,assessed_by
  ) values (
    p_failure_mode_id,v_type,v_study.scoring_model_version_id,
    p_severity,p_occurrence,p_detection,nullif(trim(coalesce(p_rationale,'')),''),
    p_actor_user_id
  )
  returning id,rpn,assessed_at into v_assessment_id,v_rpn,v_assessed_at;

  if v_type='BASELINE' and v_rpn>=v_rpn_high_threshold and not v_mode.is_high_priority then
    update public.fmea_failure_modes set is_high_priority=true where id=p_failure_mode_id;
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_fmea_record_id,'fmea_mode_assessments',v_assessment_id,
    case when v_type='BASELINE' then 'FMEA_BASELINE_SCORE' else 'FMEA_RESIDUAL_SCORE' end,
    jsonb_build_object(
      'failure_mode_id',p_failure_mode_id,
      'severity',p_severity,'occurrence',p_occurrence,'detection',p_detection,
      'rpn',v_rpn,'scoring_model_version_id',v_study.scoring_model_version_id,
      'auto_high_priority',(v_type='BASELINE' and v_rpn>=v_rpn_high_threshold and not v_mode.is_high_priority)
    ),
    nullif(trim(coalesce(p_rationale,'')),''),
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_score_fmea_mode_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'id',v_assessment_id,
    'rpn',v_rpn,
    'assessed_at',v_assessed_at,
    'assessment_type',v_type,
    'is_high_priority',(v_mode.is_high_priority or (v_type='BASELINE' and v_rpn>=v_rpn_high_threshold))
  );
end;
$function$;

revoke all on function public.qlcl_score_fmea_mode_v1(uuid,uuid,uuid,text,integer,integer,integer,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_score_fmea_mode_v1(uuid,uuid,uuid,text,integer,integer,integer,text)
  to service_role;
