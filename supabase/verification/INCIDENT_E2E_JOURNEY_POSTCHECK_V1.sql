-- INCIDENT_E2E_JOURNEY_POSTCHECK_V1
-- Synthetic end-to-end incident journey. Test data is deleted before completion.
-- Expected final result: PASS.
create temp table if not exists e2e_incident_result(result jsonb) on commit preserve rows;
truncate e2e_incident_result;

do $$
declare
  v_actor uuid;
  v_org uuid;
  v_dept uuid;
  v_incident_record uuid;
  v_incident uuid;
  v_action_record uuid;
  v_action uuid;
  v_evidence uuid;
  v_start jsonb;
  v_complete jsonb;
  v_close jsonb;
  v_lesson jsonb;
  v_immutable_blocked boolean := false;
  v_status text;
  v_record_status text;
  v_lesson_status text;
begin
  select p.user_id, p.organization_id, coalesce(p.primary_department_id,p.department_id)
    into v_actor, v_org, v_dept
  from public.profiles p
  where p.is_active=true and p.organization_id is not null
  order by p.created_at
  limit 1;

  if v_actor is null then raise exception 'E2E requires one active profile'; end if;

  insert into public.records(
    organization_id,record_type,record_code,title,work_year,owner_department_id,owner_user_id,lifecycle_status,created_by
  ) values (
    v_org,'INCIDENT','E2E-INC-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),
    '[E2E TEST] Incident full journey',2026,v_dept,v_actor,'ACTIVE',v_actor
  ) returning id into v_incident_record;

  insert into public.incidents(
    record_id,reported_at,summary,verified_description,verified_initial_response,
    verified_initial_response_by,verified_initial_response_at,harm_status,
    serious_event_flag,investigation_required,rca_required,case_owner_user_id,workflow_status,lead_department_id
  ) values (
    v_incident_record,now(),'E2E incident','E2E verified description',
    'Đã bảo đảm an toàn ngay sau phát hiện',v_actor,now(),'MILD',
    false,true,false,v_actor,'INVESTIGATION_REQUIRED',v_dept
  ) returning id into v_incident;

  v_start := public.qlcl_start_incident_investigation_v1(v_incident_record,v_actor,'STANDARD');
  select workflow_status into v_status from public.incidents where id=v_incident;
  if v_status <> 'INVESTIGATING' then raise exception 'E2E start investigation failed: %',v_status; end if;

  v_complete := public.qlcl_complete_incident_investigation_v1(
    v_incident_record,v_actor,'Đã xác minh chuỗi sự kiện E2E',
    'Tổn hại nhẹ, đã kiểm soát',
    'Cần một hành động phòng ngừa và theo dõi minh chứng',
    'E2E complete investigation'
  );
  select workflow_status into v_status from public.incidents where id=v_incident;
  if v_status <> 'ACTION_FOLLOW_UP' then raise exception 'E2E complete investigation failed: %',v_status; end if;

  insert into public.records(
    organization_id,record_type,record_code,title,work_year,owner_department_id,owner_user_id,lifecycle_status,created_by
  ) values (
    v_org,'ACTION','E2E-ACT-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),
    '[E2E TEST] Preventive action',2026,v_dept,v_actor,'ACTIVE',v_actor
  ) returning id into v_action_record;

  insert into public.actions(
    record_id,title,description,action_type,priority,lead_department_id,assignee_user_id,
    due_date,expected_result,completion_note,workflow_status,actual_end_date
  ) values (
    v_action_record,'E2E preventive action','E2E action for incident flow','PREVENTIVE',
    'NORMAL',v_dept,v_actor,current_date,'E2E completed','Đã hoàn tất trong kiểm thử',
    'COMPLETED',current_date
  ) returning id into v_action;

  insert into public.record_links(source_record_id,target_record_id,relation_type,created_by)
  values(v_incident_record,v_action_record,'HAS_ACTION',v_actor);

  insert into public.evidence(
    organization_id,title,evidence_type,external_url,validity_status,owner_department_id,uploaded_by
  ) values(
    v_org,'[E2E TEST] Incident evidence','URL','https://example.invalid/e2e','VALID',v_dept,v_actor
  ) returning id into v_evidence;

  insert into public.evidence_links(evidence_id,record_id,relation_type,evidence_role,linked_by)
  values(v_evidence,v_incident_record,'SUPPORTS','CLOSURE_EVIDENCE',v_actor);

  update public.incidents set workflow_status='AWAITING_CLOSURE',updated_at=now() where id=v_incident;
  select workflow_status into v_status from public.incidents where id=v_incident;
  if v_status <> 'AWAITING_CLOSURE' then raise exception 'E2E ready-to-close transition failed: %',v_status; end if;

  v_close := public.qlcl_close_incident_v1(v_incident_record,v_actor,'E2E closure conclusion');
  select i.workflow_status,r.lifecycle_status into v_status,v_record_status
  from public.incidents i join public.records r on r.id=i.record_id where i.id=v_incident;
  if v_status <> 'CLOSED' or v_record_status <> 'CLOSED' then
    raise exception 'E2E close failed: incident %, record %',v_status,v_record_status;
  end if;

  v_lesson := public.qlcl_save_incident_lesson_v1(
    v_incident_record,v_actor,
    jsonb_build_object(
      'title','E2E bài học','summary','Tóm tắt đã khử định danh',
      'learning_points','Bài học E2E','recommended_practice','Áp dụng biện pháp phòng ngừa',
      'audience','Toàn viện','review_note','E2E review','deidentified_confirmed',true
    ),true
  );

  select status into v_lesson_status from public.incident_lessons_learned where incident_id=v_incident;
  if v_lesson_status <> 'PUBLISHED' then raise exception 'E2E lesson publish failed: %',v_lesson_status; end if;

  begin
    perform public.qlcl_save_incident_lesson_v1(
      v_incident_record,v_actor,
      jsonb_build_object(
        'title','Attempted mutation','summary','Should fail',
        'learning_points','Should fail','recommended_practice','Should fail',
        'deidentified_confirmed',true
      ),false
    );
  exception when others then
    if position('immutable' in lower(sqlerrm)) > 0 then v_immutable_blocked := true; else raise; end if;
  end;
  if not v_immutable_blocked then raise exception 'E2E published lesson immutability failed'; end if;

  insert into e2e_incident_result(result)
  values(jsonb_build_object(
    'result','PASS',
    'journey',jsonb_build_array(
      'INVESTIGATION_REQUIRED','INVESTIGATING','ACTION_FOLLOW_UP',
      'AWAITING_CLOSURE','CLOSED','LESSON_PUBLISHED'
    ),
    'start_rpc',v_start->>'status',
    'complete_rpc',v_complete->>'status',
    'close_rpc',v_close->>'status',
    'lesson_status',v_lesson_status,
    'published_immutable',v_immutable_blocked
  ));

  delete from public.audit_logs where record_id in (v_incident_record,v_action_record);
  delete from public.evidence where id=v_evidence;
  delete from public.records where id in (v_action_record,v_incident_record);
end $$;

select result from e2e_incident_result;
