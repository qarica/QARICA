-- QARICA generic Registry/domain record creation atomic transaction V1.
create or replace function public.qlcl_create_domain_record_v1(
  p_actor_user_id uuid,
  p_record_type text,
  p_title text,
  p_work_year integer,
  p_owner_department_id uuid,
  p_owner_user_id uuid,
  p_fields jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_actor_name text;
  v_primary_department_id uuid;
  v_type text := upper(trim(coalesce(p_record_type,'')));
  v_title text := trim(coalesce(p_title,''));
  v_fields jsonb := coalesce(p_fields,'{}'::jsonb);
  v_owner_department_id uuid := p_owner_department_id;
  v_owner_user_id uuid := p_owner_user_id;
  v_code text;
  v_record_id uuid;
  v_domain_id uuid;
  v_now timestamptz := now();
  v_assignment public.indicator_assignments%rowtype;
  v_version public.criteria_set_versions%rowtype;
  v_reporter_department_id uuid;
  v_on_behalf_department_id uuid;
  v_reporter_name text;
  v_reporter_department_name text;
  v_method text;
begin
  if p_actor_user_id is null then raise exception 'Thiếu người tạo hồ sơ'; end if;
  if v_title='' then raise exception 'Tên hồ sơ là bắt buộc'; end if;
  if p_work_year < 2000 or p_work_year > 2200 then raise exception 'Năm làm việc không hợp lệ'; end if;
  if v_type not in (
    'DIRECTIVE','REPORT','INSPECTION','INDICATOR_MEASUREMENT','FINDING','INCIDENT','CAPA',
    'RISK','FMEA','IMPROVEMENT_PROPOSAL','IMPROVEMENT_PROJECT','ASSESSMENT',
    'EXTERNAL_ASSESSMENT','AUDIT','SAFETY_ALERT','FEEDBACK'
  ) then raise exception 'Loại hồ sơ chưa hỗ trợ'; end if;

  select organization_id,full_name,primary_department_id
  into v_org,v_actor_name,v_primary_department_id
  from public.profiles
  where user_id=p_actor_user_id and is_active=true;

  if v_org is null then raise exception 'Tài khoản chưa gắn tổ chức hoặc đã ngưng hoạt động'; end if;

  if v_type='INCIDENT' then
    v_owner_department_id := coalesce(
      nullif(v_fields->>'incident_location_primary_department_id','')::uuid,
      v_primary_department_id
    );
  elsif v_type='INDICATOR_MEASUREMENT' then
    if nullif(v_fields->>'indicator_assignment_id','') is null then
      raise exception 'Cần chọn chỉ số được phân công';
    end if;
    select * into v_assignment
    from public.indicator_assignments
    where id=(v_fields->>'indicator_assignment_id')::uuid
      and work_year=p_work_year
      and status='ACTIVE';
    if not found then raise exception 'Phân công chỉ số không hợp lệ hoặc không còn hoạt động'; end if;
    v_owner_department_id := v_assignment.department_id;
    v_owner_user_id := coalesce(v_assignment.collector_user_id,p_actor_user_id);
  end if;

  if v_owner_department_id is not null and not exists(
    select 1 from public.departments d
    where d.id=v_owner_department_id and d.organization_id=v_org and d.is_active=true
  ) then raise exception 'Khoa/phòng phụ trách không hợp lệ'; end if;

  if v_owner_user_id is not null and not exists(
    select 1 from public.profiles p
    where p.user_id=v_owner_user_id and p.organization_id=v_org and p.is_active=true
  ) then raise exception 'Người phụ trách không hợp lệ'; end if;

  if v_type='INSPECTION' and
     (nullif(trim(coalesce(v_fields->>'inspection_type','')),'') is null or nullif(v_fields->>'visit_date','') is null)
  then raise exception 'Loại kiểm tra và ngày đoàn đến là bắt buộc'; end if;

  if v_type='INDICATOR_MEASUREMENT' then
    if nullif(v_fields->>'period_start','') is null or nullif(v_fields->>'period_end','') is null then
      raise exception 'Cần chọn chỉ số và kỳ đo';
    end if;
    if (v_fields->>'period_end')::date < (v_fields->>'period_start')::date then
      raise exception 'Ngày kết thúc kỳ đo không được trước ngày bắt đầu';
    end if;
  end if;

  if v_type='FINDING' and nullif(trim(coalesce(v_fields->>'description','')),'') is null
    then raise exception 'Mô tả Finding là bắt buộc'; end if;

  if v_type='INCIDENT' then
    if nullif(trim(coalesce(v_fields->>'initial_description','')),'') is null then raise exception 'Mô tả sự cố là bắt buộc'; end if;
    if nullif(v_fields->>'incident_location_primary_department_id','') is null then raise exception 'Khoa/phòng nơi xảy ra là bắt buộc'; end if;
    if nullif(v_fields->>'occurred_at','') is null then raise exception 'Ngày, giờ xảy ra sự cố là bắt buộc'; end if;
    if nullif(v_fields->>'reported_at','') is null then raise exception 'Ngày, giờ báo cáo là bắt buộc'; end if;
  end if;

  if v_type='CAPA' and nullif(trim(coalesce(v_fields->>'problem_statement','')),'') is null
    then raise exception 'Vấn đề cần CAPA là bắt buộc'; end if;
  if v_type='RISK' and nullif(trim(coalesce(v_fields->>'risk_event','')),'') is null
    then raise exception 'Sự kiện rủi ro là bắt buộc'; end if;

  if v_type='FMEA' then
    v_method := upper(trim(coalesce(v_fields->>'method','')));
    if v_method not in ('FMEA','HFMEA') then raise exception 'Cần chọn FMEA hoặc HFMEA'; end if;
  end if;

  if v_type='IMPROVEMENT_PROPOSAL' and nullif(trim(coalesce(v_fields->>'problem_description','')),'') is null
    then raise exception 'Vấn đề/thực trạng là bắt buộc'; end if;

  if v_type='ASSESSMENT' then
    if nullif(v_fields->>'criteria_version_id','') is null or nullif(trim(coalesce(v_fields->>'round_type','')),'') is null
      then raise exception 'Bộ tiêu chí và loại đợt là bắt buộc'; end if;
    select * into v_version from public.criteria_set_versions
    where id=(v_fields->>'criteria_version_id')::uuid and status='PUBLISHED';
    if not found then raise exception 'Chỉ được tạo đợt từ bộ tiêu chí đã PUBLISHED'; end if;
  end if;

  if v_type='EXTERNAL_ASSESSMENT' and nullif(trim(coalesce(v_fields->>'authority','')),'') is null
    then raise exception 'Cơ quan/đoàn đánh giá là bắt buộc'; end if;
  if v_type='AUDIT' and nullif(trim(coalesce(v_fields->>'audit_type','')),'') is null
    then raise exception 'Loại Audit / Tracer là bắt buộc'; end if;
  if v_type='FEEDBACK' and nullif(trim(coalesce(v_fields->>'description','')),'') is null
    then raise exception 'Nội dung phản ánh là bắt buộc'; end if;

  v_code := public.next_record_code(v_org,v_type,p_work_year);

  insert into public.records(
    organization_id,record_type,record_code,title,work_year,
    owner_department_id,owner_user_id,lifecycle_status,created_by
  ) values (
    v_org,v_type,v_code,v_title,p_work_year,
    v_owner_department_id,v_owner_user_id,'ACTIVE',p_actor_user_id
  )
  returning id into v_record_id;

  if v_type='DIRECTIVE' then
    insert into public.external_directives(
      record_id,source_authority,document_number,directive_type,issued_date,effective_date,received_date,
      document_url,implementation_due_date,report_due_date,summary,requirements,
      lead_department_id,owner_user_id,priority,workflow_status
    ) values (
      v_record_id,nullif(trim(v_fields->>'source_authority'),''),
      nullif(trim(v_fields->>'document_number'),''),nullif(trim(v_fields->>'directive_type'),''),
      nullif(v_fields->>'issued_date','')::date,nullif(v_fields->>'effective_date','')::date,
      nullif(v_fields->>'received_date','')::date,nullif(trim(v_fields->>'document_url'),''),
      nullif(v_fields->>'implementation_due_date','')::date,nullif(v_fields->>'report_due_date','')::date,
      nullif(trim(v_fields->>'summary'),''),nullif(trim(v_fields->>'requirements'),''),
      v_owner_department_id,v_owner_user_id,coalesce(nullif(trim(v_fields->>'priority'),''),'NORMAL'),'OPEN'
    ) returning id into v_domain_id;

  elsif v_type='REPORT' then
    insert into public.reporting_obligations(
      record_id,report_type,reporting_period,reporting_period_start,reporting_period_end,data_cutoff_date,
      due_date,preparing_department_id,preparer_user_id,recipient_name,submission_method,workflow_status,notes
    ) values (
      v_record_id,nullif(trim(v_fields->>'report_type'),''),nullif(trim(v_fields->>'reporting_period'),''),
      nullif(v_fields->>'reporting_period_start','')::date,nullif(v_fields->>'reporting_period_end','')::date,
      nullif(v_fields->>'data_cutoff_date','')::date,nullif(v_fields->>'due_date','')::date,
      v_owner_department_id,v_owner_user_id,nullif(trim(v_fields->>'recipient_name'),''),
      nullif(trim(v_fields->>'submission_method'),''),'NOT_DUE',nullif(trim(v_fields->>'notes'),'')
    ) returning id into v_domain_id;

  elsif v_type='INSPECTION' then
    insert into public.inspection_events(
      record_id,inspection_type,authority,visit_date,lead_department_id,owner_user_id,workflow_status
    ) values (
      v_record_id,trim(v_fields->>'inspection_type'),nullif(trim(v_fields->>'authority'),''),
      (v_fields->>'visit_date')::date,v_owner_department_id,v_owner_user_id,'PLANNING'
    ) returning id into v_domain_id;

  elsif v_type='INDICATOR_MEASUREMENT' then
    insert into public.indicator_measurements(
      record_id,indicator_assignment_id,period_start,period_end,numerator_value,denominator_value,
      raw_value,source_mode,workflow_status,entered_by
    ) values (
      v_record_id,v_assignment.id,(v_fields->>'period_start')::date,(v_fields->>'period_end')::date,
      nullif(v_fields->>'numerator_value','')::numeric,nullif(v_fields->>'denominator_value','')::numeric,
      nullif(v_fields->>'raw_value','')::numeric,'MANUAL','DRAFT',p_actor_user_id
    ) returning id into v_domain_id;

  elsif v_type='FINDING' then
    insert into public.findings(
      record_id,finding_type,description,severity,lead_department_id,owner_user_id,
      identified_at,due_date,immediate_action,workflow_status
    ) values (
      v_record_id,nullif(trim(v_fields->>'finding_type'),''),trim(v_fields->>'description'),
      nullif(trim(v_fields->>'severity'),''),v_owner_department_id,v_owner_user_id,
      coalesce(nullif(v_fields->>'identified_at','')::timestamptz,v_now),
      nullif(v_fields->>'due_date','')::date,nullif(trim(v_fields->>'immediate_action'),''),'OPEN'
    ) returning id into v_domain_id;

  elsif v_type='INCIDENT' then
    insert into public.incidents(
      record_id,occurred_at,detected_at,reported_at,incident_location_department_id,
      incident_location_type,incident_location_text,summary,workflow_status,lead_department_id,case_owner_user_id
    ) values (
      v_record_id,(v_fields->>'occurred_at')::timestamptz,nullif(v_fields->>'detected_at','')::timestamptz,
      (v_fields->>'reported_at')::timestamptz,(v_fields->>'incident_location_primary_department_id')::uuid,
      nullif(trim(v_fields->>'incident_location_type'),''),nullif(trim(v_fields->>'incident_location_text'),''),
      trim(v_fields->>'initial_description'),'REPORTED',v_owner_department_id,null
    ) returning id into v_domain_id;

    v_on_behalf_department_id := nullif(v_fields->>'on_behalf_primary_department_id','')::uuid;
    v_reporter_department_id := coalesce(
      nullif(v_fields->>'reporter_primary_department_id','')::uuid,
      v_on_behalf_department_id,
      v_primary_department_id
    );
    if v_reporter_department_id is not null then
      select name into v_reporter_department_name
      from public.departments
      where id=v_reporter_department_id and organization_id=v_org;
    end if;
    v_reporter_name := coalesce(
      nullif(trim(v_fields->>'reporter_name'),''),
      case when v_on_behalf_department_id is null then v_actor_name else null end
    );

    insert into public.incident_reports(
      incident_id,report_type,reporter_user_id,reporter_name_snapshot,reporter_department_id,
      reporter_department_name_snapshot,reporter_identity_confidential,reporter_phone,reporter_email,
      reporter_role_type,incident_location_department_id,incident_location_type,occurred_at,detected_at,
      initial_description,initial_solution_proposal,initial_harm_assessment,initial_response_description,
      notified_treating_responsible,documented_in_medical_record,notified_family_guardian,notified_patient,
      initial_occurrence_classification,patient_name,patient_code,patient_date_of_birth,patient_sex,
      patient_department_id,incident_subject_type,mandatory_report_flag
    ) values (
      v_domain_id,coalesce(nullif(trim(v_fields->>'report_type'),''),'VOLUNTARY'),p_actor_user_id,
      v_reporter_name,v_reporter_department_id,v_reporter_department_name,
      coalesce((v_fields->>'reporter_identity_confidential')::boolean,false),
      nullif(trim(v_fields->>'reporter_phone'),''),nullif(trim(v_fields->>'reporter_email'),''),
      nullif(trim(v_fields->>'reporter_role_type'),''),(v_fields->>'incident_location_primary_department_id')::uuid,
      nullif(trim(v_fields->>'incident_location_type'),''),(v_fields->>'occurred_at')::timestamptz,
      nullif(v_fields->>'detected_at','')::timestamptz,trim(v_fields->>'initial_description'),
      nullif(trim(v_fields->>'initial_solution_proposal'),''),nullif(trim(v_fields->>'initial_harm_assessment'),''),
      nullif(trim(v_fields->>'initial_response_description'),''),
      coalesce((v_fields->>'notified_treating_responsible')::boolean,false),
      coalesce((v_fields->>'documented_in_medical_record')::boolean,false),
      coalesce((v_fields->>'notified_family_guardian')::boolean,false),
      coalesce((v_fields->>'notified_patient')::boolean,false),
      nullif(trim(v_fields->>'initial_occurrence_classification'),''),nullif(trim(v_fields->>'patient_name'),''),
      nullif(trim(v_fields->>'patient_code'),''),nullif(v_fields->>'patient_date_of_birth','')::date,
      nullif(trim(v_fields->>'patient_sex'),''),nullif(v_fields->>'patient_primary_department_id','')::uuid,
      nullif(trim(v_fields->>'incident_subject_type'),''),
      coalesce(nullif(trim(v_fields->>'report_type'),'')='MANDATORY',false)
    );

  elsif v_type='CAPA' then
    insert into public.capas(
      record_id,problem_statement,priority,immediate_correction,lead_department_id,owner_user_id,
      workflow_status,approval_required,effectiveness_due_date
    ) values (
      v_record_id,trim(v_fields->>'problem_statement'),
      coalesce(nullif(trim(v_fields->>'priority'),''),'NORMAL'),
      nullif(trim(v_fields->>'immediate_correction'),''),v_owner_department_id,v_owner_user_id,
      'DRAFT',coalesce((v_fields->>'approval_required')::boolean,false),
      nullif(v_fields->>'effectiveness_due_date','')::date
    ) returning id into v_domain_id;

  elsif v_type='RISK' then
    insert into public.risks(
      record_id,identified_year,risk_event,cause_summary,potential_consequence,process_name,
      location_department_id,owner_department_id,owner_user_id,workflow_status,next_review_date,review_frequency
    ) values (
      v_record_id,p_work_year,trim(v_fields->>'risk_event'),nullif(trim(v_fields->>'cause_summary'),''),
      nullif(trim(v_fields->>'potential_consequence'),''),nullif(trim(v_fields->>'process_name'),''),
      v_owner_department_id,v_owner_department_id,v_owner_user_id,'IDENTIFIED',
      nullif(v_fields->>'next_review_date','')::date,nullif(trim(v_fields->>'review_frequency'),'')
    ) returning id into v_domain_id;

  elsif v_type='FMEA' then
    insert into public.fmea_studies(
      record_id,method,title,process_name,scope,work_year,lead_department_id,lead_user_id,
      start_date,target_completion_date,scoring_model_version_id,workflow_status
    ) values (
      v_record_id,v_method,v_title,nullif(trim(v_fields->>'process_name'),''),
      nullif(trim(v_fields->>'scope'),''),p_work_year,v_owner_department_id,v_owner_user_id,
      nullif(v_fields->>'start_date','')::date,nullif(v_fields->>'target_completion_date','')::date,
      nullif(v_fields->>'scoring_model_version_id','')::uuid,'DRAFT'
    ) returning id into v_domain_id;

  elsif v_type='IMPROVEMENT_PROPOSAL' then
    insert into public.improvement_proposals(
      record_id,work_year,title,problem_description,reason_for_improvement,source_type,
      proposing_department_id,proposer_user_id,existing_data_summary,proposed_scope,workflow_status
    ) values (
      v_record_id,p_work_year,v_title,trim(v_fields->>'problem_description'),
      nullif(trim(v_fields->>'reason_for_improvement'),''),nullif(trim(v_fields->>'source_type'),''),
      v_owner_department_id,coalesce(v_owner_user_id,p_actor_user_id),
      nullif(trim(v_fields->>'existing_data_summary'),''),nullif(trim(v_fields->>'proposed_scope'),''),'DRAFT'
    ) returning id into v_domain_id;

  elsif v_type='IMPROVEMENT_PROJECT' then
    insert into public.improvement_projects(
      record_id,work_year,title,problem_statement,lead_department_id,project_leader_user_id,
      start_date,target_end_date,scope_description,workflow_status
    ) values (
      v_record_id,p_work_year,v_title,nullif(trim(v_fields->>'problem_statement'),''),
      v_owner_department_id,v_owner_user_id,nullif(v_fields->>'start_date','')::date,
      nullif(v_fields->>'target_end_date','')::date,nullif(trim(v_fields->>'scope_description'),''),'DRAFT'
    ) returning id into v_domain_id;

  elsif v_type='ASSESSMENT' then
    insert into public.assessment_rounds(
      record_id,criteria_version_id,work_year,round_type,start_date,submission_deadline,
      review_deadline,finalization_date,workflow_status
    ) values (
      v_record_id,v_version.id,p_work_year,trim(v_fields->>'round_type'),
      nullif(v_fields->>'start_date','')::date,nullif(v_fields->>'submission_deadline','')::date,
      nullif(v_fields->>'review_deadline','')::date,nullif(v_fields->>'finalization_date','')::date,'DRAFT'
    ) returning id into v_domain_id;

    insert into public.assessment_round_criteria(
      assessment_round_id,criteria_item_id,criterion_id,is_required
    )
    select v_domain_id,ci.id,ci.id,true
    from public.criteria_items ci
    where ci.criteria_version_id=v_version.id;

  elsif v_type='EXTERNAL_ASSESSMENT' then
    insert into public.external_assessment_events(
      record_id,authority,assessment_date,criteria_version_id,notes
    ) values (
      v_record_id,trim(v_fields->>'authority'),nullif(v_fields->>'assessment_date','')::date,
      nullif(v_fields->>'criteria_version_id','')::uuid,nullif(trim(v_fields->>'notes'),'')
    ) returning id into v_domain_id;

  elsif v_type='AUDIT' then
    insert into public.audits(
      record_id,audit_type,work_year,title,objective,start_date,end_date,lead_auditor_id,workflow_status
    ) values (
      v_record_id,trim(v_fields->>'audit_type'),p_work_year,v_title,nullif(trim(v_fields->>'objective'),''),
      nullif(v_fields->>'start_date','')::date,nullif(v_fields->>'end_date','')::date,v_owner_user_id,'DRAFT'
    ) returning id into v_domain_id;

  elsif v_type='SAFETY_ALERT' then
    insert into public.safety_alerts(
      record_id,title,summary,lesson,recommendation,expires_at,status
    ) values (
      v_record_id,v_title,nullif(trim(v_fields->>'summary'),''),nullif(trim(v_fields->>'lesson'),''),
      nullif(trim(v_fields->>'recommendation'),''),nullif(v_fields->>'expires_at','')::timestamptz,'DRAFT'
    ) returning id into v_domain_id;

  elsif v_type='FEEDBACK' then
    insert into public.feedback_records(
      record_id,feedback_type,received_at,source_channel,subject,description,related_department_id,
      owner_user_id,response_due_at,workflow_status
    ) values (
      v_record_id,nullif(trim(v_fields->>'feedback_type'),''),coalesce(nullif(v_fields->>'received_at','')::timestamptz,v_now),
      nullif(trim(v_fields->>'source_channel'),''),nullif(trim(v_fields->>'subject'),''),
      trim(v_fields->>'description'),v_owner_department_id,v_owner_user_id,
      nullif(v_fields->>'response_due_at','')::timestamptz,'RECEIVED'
    ) returning id into v_domain_id;
  end if;

  if v_domain_id is null then raise exception 'Không tạo được dữ liệu nghiệp vụ'; end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,new_value,reason,request_meta
  ) values (
    p_actor_user_id,v_record_id,'records',v_record_id,'DOMAIN_RECORD_CREATE',
    jsonb_build_object(
      'record_type',v_type,'record_code',v_code,'domain_id',v_domain_id,
      'owner_department_id',v_owner_department_id,'owner_user_id',v_owner_user_id
    ),
    'Tạo hồ sơ Registry và dữ liệu nghiệp vụ trong một giao dịch.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_create_domain_record_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'record_id',v_record_id,
    'record_code',v_code,
    'domain_id',v_domain_id,
    'record_type',v_type
  );
end;
$function$;

revoke all on function public.qlcl_create_domain_record_v1(uuid,text,text,integer,uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.qlcl_create_domain_record_v1(uuid,text,text,integer,uuid,uuid,jsonb)
  to service_role;
