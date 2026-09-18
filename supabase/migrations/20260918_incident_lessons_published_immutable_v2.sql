create or replace function public.qlcl_save_incident_lesson_v1(
  p_incident_record_id uuid,
  p_actor_user_id uuid,
  p_payload jsonb,
  p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_incident public.incidents%rowtype;
  v_record public.records%rowtype;
  v_existing public.incident_lessons_learned%rowtype;
  v_lesson public.incident_lessons_learned%rowtype;
  v_title text := trim(coalesce(p_payload->>'title',''));
  v_summary text := trim(coalesce(p_payload->>'summary',''));
  v_learning_points text := trim(coalesce(p_payload->>'learning_points',''));
  v_recommended_practice text := trim(coalesce(p_payload->>'recommended_practice',''));
  v_audience text := nullif(trim(coalesce(p_payload->>'audience','')),'');
  v_review_note text := nullif(trim(coalesce(p_payload->>'review_note','')),'');
  v_deidentified boolean := coalesce((p_payload->>'deidentified_confirmed')::boolean,false);
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'payload must be a JSON object'; end if;

  select * into v_record
  from public.records
  where id=p_incident_record_id and record_type='INCIDENT';
  if not found then raise exception 'Incident record not found'; end if;

  select * into v_incident
  from public.incidents
  where record_id=p_incident_record_id
  for update;
  if not found then raise exception 'Incident domain row not found'; end if;

  if not exists(
    select 1
    from public.profiles p
    where p.user_id=p_actor_user_id
      and p.organization_id=v_record.organization_id
      and p.is_active
  ) then
    raise exception 'Actor is invalid or outside organization';
  end if;

  select * into v_existing
  from public.incident_lessons_learned
  where incident_id=v_incident.id
  for update;

  if found and v_existing.status='PUBLISHED' then
    raise exception 'Published Lessons Learned is immutable; use a future withdrawal/revision workflow';
  end if;

  if p_publish then
    if v_incident.workflow_status <> 'CLOSED' then
      raise exception 'Lessons Learned can only be published after incident closure';
    end if;
    if v_title='' or v_summary='' or v_learning_points='' or v_recommended_practice='' then
      raise exception 'Title, summary, learning points and recommended practice are required for publication';
    end if;
    if not v_deidentified then
      raise exception 'De-identification confirmation is required before publication';
    end if;
  end if;

  insert into public.incident_lessons_learned(
    incident_id,status,title,summary,learning_points,recommended_practice,audience,
    deidentified_confirmed,review_note,reviewed_by,reviewed_at,published_at,
    created_by,updated_by,updated_at
  )
  values(
    v_incident.id,
    case when p_publish then 'PUBLISHED' else 'DRAFT' end,
    nullif(v_title,''),nullif(v_summary,''),nullif(v_learning_points,''),
    nullif(v_recommended_practice,''),v_audience,v_deidentified,v_review_note,
    case when p_publish then p_actor_user_id else null end,
    case when p_publish then now() else null end,
    case when p_publish then now() else null end,
    p_actor_user_id,p_actor_user_id,now()
  )
  on conflict(incident_id) do update set
    status=case when p_publish then 'PUBLISHED' else 'DRAFT' end,
    title=excluded.title,
    summary=excluded.summary,
    learning_points=excluded.learning_points,
    recommended_practice=excluded.recommended_practice,
    audience=excluded.audience,
    deidentified_confirmed=excluded.deidentified_confirmed,
    review_note=excluded.review_note,
    reviewed_by=case when p_publish then p_actor_user_id else public.incident_lessons_learned.reviewed_by end,
    reviewed_at=case when p_publish then now() else public.incident_lessons_learned.reviewed_at end,
    published_at=case when p_publish then now() else public.incident_lessons_learned.published_at end,
    updated_by=p_actor_user_id,
    updated_at=now()
  returning * into v_lesson;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,new_value,reason,request_meta
  )
  values(
    p_actor_user_id,p_incident_record_id,'incident_lessons_learned',v_lesson.id,
    case when p_publish then 'INCIDENT_LESSON_PUBLISH' else 'INCIDENT_LESSON_SAVE_DRAFT' end,
    jsonb_build_object(
      'status',v_lesson.status,
      'deidentified_confirmed',v_lesson.deidentified_confirmed,
      'published_at',v_lesson.published_at
    ),
    case when p_publish
      then 'Duyệt và phát hành bài học kinh nghiệm đã xác nhận khử định danh.'
      else 'Lưu bản nháp bài học kinh nghiệm.'
    end,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_save_incident_lesson_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'lesson_id',v_lesson.id,
    'status',v_lesson.status,
    'published_at',v_lesson.published_at,
    'deidentified_confirmed',v_lesson.deidentified_confirmed
  );
end;
$function$;
