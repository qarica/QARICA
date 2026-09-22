-- Production-aligned repository lineage for incident/RCA database functions.
-- No business-data mutation.

CREATE OR REPLACE FUNCTION public.qlcl_close_incident_v1(p_incident_record_id uuid, p_actor_user_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_record records%rowtype; v_incident incidents%rowtype; v_trace jsonb; v_action_count integer; v_incomplete integer;
  v_evidence integer; v_required_root_count integer; v_uncovered_root_count integer; v_ineffective_capa_count integer;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Incident close conclusion is required'; end if;
  select * into v_record from records where id=p_incident_record_id and record_type='INCIDENT' for update;
  if not found then raise exception 'Incident record not found'; end if;
  if v_record.lifecycle_status<>'ACTIVE' then raise exception 'Incident record is not active'; end if;
  select * into v_incident from incidents where record_id=p_incident_record_id for update;
  if not found then raise exception 'Incident domain row not found'; end if;
  if v_incident.workflow_status<>'AWAITING_CLOSURE' then raise exception 'Incident must be AWAITING_CLOSURE'; end if;
  v_trace:=public.qlcl_incident_action_trace_state_v1(p_incident_record_id);
  v_action_count:=coalesce((v_trace->>'action_count')::integer,0);
  v_incomplete:=coalesce((v_trace->>'incomplete_action_count')::integer,0);
  v_required_root_count:=coalesce((v_trace->>'required_root_count')::integer,0);
  v_uncovered_root_count:=coalesce((v_trace->>'uncovered_root_count')::integer,0);
  v_ineffective_capa_count:=coalesce((v_trace->>'ineffective_capa_count')::integer,0);
  if coalesce(v_incident.rca_required,false) then
    if nullif(v_trace->>'rca_analysis_id','') is null then raise exception 'Completed structured RCA is required before incident close'; end if;
    if v_required_root_count<1 then raise exception 'RCA must identify at least one root cause requiring action'; end if;
    if v_uncovered_root_count>0 then raise exception 'Incident has % RCA root cause(s) without an active linked Action',v_uncovered_root_count; end if;
    if v_ineffective_capa_count>0 then raise exception 'Linked CAPA must be EFFECTIVE or CLOSED before incident close'; end if;
    if v_action_count<1 then raise exception 'At least one Action is required for an incident with required RCA'; end if;
  end if;
  if v_incomplete>0 then raise exception 'Incident has % incomplete Action(s)',v_incomplete; end if;
  select count(*) into v_evidence from evidence_links where record_id=p_incident_record_id;
  if v_evidence<1 then raise exception 'Incident handling evidence is required'; end if;
  update incidents set workflow_status='CLOSED',closed_at=now(),updated_at=now() where id=v_incident.id;
  update records set lifecycle_status='CLOSED',closed_at=now(),updated_at=now() where id=p_incident_record_id;
  insert into record_status_history(record_id,old_status,new_status,changed_by,reason)
    values(p_incident_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,trim(p_reason));
  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
    values(p_actor_user_id,p_incident_record_id,'incidents',v_incident.id,'INCIDENT_CLOSE',
      jsonb_build_object('workflow_status',v_incident.workflow_status),jsonb_build_object('workflow_status','CLOSED','trace_state',v_trace),
      trim(p_reason),jsonb_build_object('source','qlcl-ui','sensitive',true,'transaction','qlcl_close_incident_v1'));
  return jsonb_build_object('ok',true,'status','CLOSED','action_count',v_action_count,'evidence_count',v_evidence,'trace_state',v_trace);
end;$function$

CREATE OR REPLACE FUNCTION public.qlcl_complete_incident_investigation_v1(p_incident_record_id uuid, p_actor_user_id uuid, p_verified_event_summary text, p_harm_conclusion text, p_conclusion text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_record records%rowtype; v_incident incidents%rowtype; v_inv incident_investigations%rowtype;
  v_rca rca_analyses%rowtype; v_reason text; v_factor_count integer:=0; v_timeline_count integer:=0;
  v_why_count integer:=0; v_fishbone_count integer:=0; v_root_count integer:=0;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_verified_event_summary),'')='' or coalesce(trim(p_harm_conclusion),'')='' or coalesce(trim(p_conclusion),'')='' then
    raise exception 'Verified event summary, harm conclusion and investigation conclusion are required';
  end if;
  select * into v_record from records where id=p_incident_record_id and record_type='INCIDENT' for update;
  if not found then raise exception 'Incident record not found'; end if;
  if v_record.lifecycle_status<>'ACTIVE' then raise exception 'Incident record is not active'; end if;
  select * into v_incident from incidents where record_id=p_incident_record_id for update;
  if not found then raise exception 'Incident domain row not found'; end if;
  if v_incident.workflow_status<>'INVESTIGATING' then raise exception 'Incident must be INVESTIGATING'; end if;
  select * into v_inv from incident_investigations where incident_id=v_incident.id and status='IN_PROGRESS' order by created_at desc limit 1 for update;
  if not found then raise exception 'No active investigation found'; end if;
  if coalesce(v_incident.rca_required,false) then
    select count(*) into v_factor_count from incident_contributing_factors where incident_id=v_incident.id;
    if v_factor_count<1 then raise exception 'RCA requires at least one structured contributing factor before investigation completion'; end if;
    select * into v_rca from rca_analyses where incident_id=v_incident.id for update;
    if not found then raise exception 'Structured RCA is required before investigation completion'; end if;
    select count(*) into v_timeline_count from rca_timeline_events where rca_analysis_id=v_rca.id;
    select count(*) into v_why_count from rca_five_whys where rca_analysis_id=v_rca.id;
    select count(*) into v_fishbone_count from rca_fishbone_factors where rca_analysis_id=v_rca.id;
    select count(*) into v_root_count from rca_root_causes where rca_analysis_id=v_rca.id;
    if v_timeline_count<1 or v_fishbone_count<1 or v_root_count<1 or (v_why_count>0 and v_why_count<3) then
      raise exception 'Structured RCA gate incomplete: Timeline >=1, Fishbone >=1, Root Cause >=1; Five Why optional but >=3 when used';
    end if;
    update rca_analyses set status='COMPLETED',completed_at=coalesce(completed_at,now()) where id=v_rca.id;
  end if;
  update incident_investigations set verified_event_summary=trim(p_verified_event_summary),harm_conclusion=trim(p_harm_conclusion),
    conclusion=trim(p_conclusion),status='COMPLETED',completed_at=now() where id=v_inv.id;
  update incidents set workflow_status='ACTION_FOLLOW_UP',updated_at=now() where id=v_incident.id;
  v_reason:=coalesce(nullif(trim(p_reason),''),'Hoàn tất điều tra và chuyển theo dõi hành động phòng ngừa tái diễn.');
  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
  values(p_actor_user_id,p_incident_record_id,'incidents',v_incident.id,'INCIDENT_COMPLETE_INVESTIGATION',
    jsonb_build_object('workflow_status',v_incident.workflow_status),
    jsonb_build_object('workflow_status','ACTION_FOLLOW_UP','investigation_id',v_inv.id,'rca_required',coalesce(v_incident.rca_required,false),
      'contributing_factor_count',v_factor_count,'rca_timeline_count',v_timeline_count,'rca_five_why_count',v_why_count,
      'rca_fishbone_count',v_fishbone_count,'rca_root_cause_count',v_root_count),
    v_reason,jsonb_build_object('source','qlcl-ui','sensitive',true,'transaction','qlcl_complete_incident_investigation_v1','gate','combined_rca_v2'));
  return jsonb_build_object('ok',true,'status','ACTION_FOLLOW_UP','investigation_id',v_inv.id,'rca_required',coalesce(v_incident.rca_required,false),
    'contributing_factor_count',v_factor_count,'rca_timeline_count',v_timeline_count,'rca_five_why_count',v_why_count,
    'rca_fishbone_count',v_fishbone_count,'rca_root_cause_count',v_root_count);
end;$function$

CREATE OR REPLACE FUNCTION public.qlcl_guard_incident_ready_to_close_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_trace jsonb;
  v_required_root_count integer;
  v_uncovered_root_count integer;
  v_action_count integer;
  v_incomplete integer;
  v_ineffective_capa_count integer;
begin
  if new.workflow_status='AWAITING_CLOSURE'
     and old.workflow_status is distinct from new.workflow_status
     and coalesce(new.rca_required,false) then
    v_trace := public.qlcl_incident_action_trace_state_v1(new.record_id);
    v_required_root_count := coalesce((v_trace->>'required_root_count')::integer,0);
    v_uncovered_root_count := coalesce((v_trace->>'uncovered_root_count')::integer,0);
    v_action_count := coalesce((v_trace->>'action_count')::integer,0);
    v_incomplete := coalesce((v_trace->>'incomplete_action_count')::integer,0);
    v_ineffective_capa_count := coalesce((v_trace->>'ineffective_capa_count')::integer,0);

    if nullif(v_trace->>'rca_analysis_id','') is null then
      raise exception 'Completed structured RCA is required before ready-to-close';
    end if;
    if v_required_root_count < 1 then
      raise exception 'RCA must identify at least one root cause requiring action';
    end if;
    if v_uncovered_root_count > 0 then
      raise exception 'Incident has % RCA root cause(s) without an active linked Action',v_uncovered_root_count;
    end if;
    if v_action_count < 1 then
      raise exception 'At least one RCA-linked Action is required before ready-to-close';
    end if;
    if v_incomplete > 0 then
      raise exception 'Incident has % incomplete RCA-linked Action(s)',v_incomplete;
    end if;
    if v_ineffective_capa_count > 0 then
      raise exception 'Linked CAPA must be EFFECTIVE or CLOSED before ready-to-close';
    end if;
  end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.qlcl_incident_action_trace_state_v1(p_incident_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_incident public.incidents%rowtype;
  v_rca_id uuid;
  v_required_root_count integer := 0;
  v_uncovered_root_count integer := 0;
  v_action_count integer := 0;
  v_incomplete_action_count integer := 0;
  v_linked_capa_count integer := 0;
  v_ineffective_capa_count integer := 0;
begin
  select * into v_incident from public.incidents where record_id=p_incident_record_id;
  if not found then raise exception 'Incident domain row not found'; end if;

  if coalesce(v_incident.rca_required,false) then
    select r.id into v_rca_id
    from public.rca_analyses r
    where r.incident_id=v_incident.id and r.status='COMPLETED'
    order by r.completed_at desc nulls last, r.started_at desc nulls last
    limit 1;

    if v_rca_id is not null then
      select count(*) into v_required_root_count
      from public.rca_root_causes rc
      where rc.rca_analysis_id=v_rca_id and rc.action_required;

      select count(*) into v_uncovered_root_count
      from public.rca_root_causes rc
      where rc.rca_analysis_id=v_rca_id and rc.action_required
        and not exists (
          select 1
          from public.rca_root_cause_action_links l
          join public.actions a on a.id=l.action_id
          join public.records ar on ar.id=a.record_id
          where l.root_cause_id=rc.id
            and ar.lifecycle_status <> 'ARCHIVED'
            and coalesce(a.workflow_status,'') not in ('CANCELLED','NOT_APPLICABLE')
        );

      select count(distinct a.id) into v_action_count
      from public.rca_root_causes rc
      join public.rca_root_cause_action_links l on l.root_cause_id=rc.id
      join public.actions a on a.id=l.action_id
      join public.records ar on ar.id=a.record_id
      where rc.rca_analysis_id=v_rca_id and rc.action_required
        and ar.lifecycle_status <> 'ARCHIVED'
        and coalesce(a.workflow_status,'') not in ('CANCELLED','NOT_APPLICABLE');

      select count(distinct a.id) into v_incomplete_action_count
      from public.rca_root_causes rc
      join public.rca_root_cause_action_links l on l.root_cause_id=rc.id
      join public.actions a on a.id=l.action_id
      join public.records ar on ar.id=a.record_id
      where rc.rca_analysis_id=v_rca_id and rc.action_required
        and ar.lifecycle_status <> 'ARCHIVED'
        and coalesce(a.workflow_status,'') not in ('COMPLETED','CANCELLED','NOT_APPLICABLE');
    end if;

    select count(*) into v_linked_capa_count
    from public.record_links l
    join public.records r on r.id=l.target_record_id and r.record_type='CAPA' and r.lifecycle_status <> 'ARCHIVED'
    join public.capas c on c.record_id=r.id
    where l.source_record_id=p_incident_record_id and l.relation_type='GENERATED_CAPA';

    select count(*) into v_ineffective_capa_count
    from public.record_links l
    join public.records r on r.id=l.target_record_id and r.record_type='CAPA' and r.lifecycle_status <> 'ARCHIVED'
    join public.capas c on c.record_id=r.id
    where l.source_record_id=p_incident_record_id and l.relation_type='GENERATED_CAPA'
      and coalesce(c.workflow_status,'') not in ('EFFECTIVE','CLOSED');
  else
    select count(*) into v_action_count
    from public.record_links l
    join public.actions a on a.record_id=l.target_record_id
    join public.records ar on ar.id=a.record_id
    where l.source_record_id=p_incident_record_id and l.relation_type='HAS_ACTION'
      and ar.lifecycle_status <> 'ARCHIVED';

    select count(*) into v_incomplete_action_count
    from public.record_links l
    join public.actions a on a.record_id=l.target_record_id
    join public.records ar on ar.id=a.record_id
    where l.source_record_id=p_incident_record_id and l.relation_type='HAS_ACTION'
      and ar.lifecycle_status <> 'ARCHIVED'
      and coalesce(a.workflow_status,'') not in ('COMPLETED','CANCELLED','NOT_APPLICABLE');
  end if;

  return jsonb_build_object(
    'rca_required',coalesce(v_incident.rca_required,false),
    'rca_analysis_id',v_rca_id,
    'required_root_count',v_required_root_count,
    'uncovered_root_count',v_uncovered_root_count,
    'action_count',v_action_count,
    'incomplete_action_count',v_incomplete_action_count,
    'linked_capa_count',v_linked_capa_count,
    'ineffective_capa_count',v_ineffective_capa_count
  );
end;
$function$

CREATE OR REPLACE FUNCTION public.qlcl_save_incident_contributing_factors_v1(p_incident_record_id uuid, p_actor_user_id uuid, p_factor_codes text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_incident public.incidents%rowtype;
  v_old jsonb;
  v_new jsonb;
  v_invalid text;
begin
  if p_actor_user_id is null then
    raise exception 'actor_user_id is required';
  end if;

  select i.* into v_incident
  from public.incidents i
  join public.records r on r.id = i.record_id
  where i.record_id = p_incident_record_id
    and r.record_type = 'INCIDENT'
    and r.lifecycle_status = 'ACTIVE'
  for update;

  if not found then
    raise exception 'Active incident record not found';
  end if;

  if v_incident.workflow_status not in ('INVESTIGATION_REQUIRED','INVESTIGATING') then
    raise exception 'Contributing factors can only be edited during incident investigation';
  end if;

  select x into v_invalid
  from unnest(coalesce(p_factor_codes, array[]::text[])) as x
  where x not in (
    'PATIENT','STAFF','TASK_TECHNOLOGY','TEAM','WORK_ENVIRONMENT',
    'INFORMATION_SYSTEMS','ORGANIZATION_MANAGEMENT','INSTITUTIONAL_CONTEXT'
  )
  limit 1;
  if v_invalid is not null then
    raise exception 'Invalid contributing factor code: %', v_invalid;
  end if;

  select coalesce(jsonb_agg(f.factor_code order by f.factor_code), '[]'::jsonb)
  into v_old
  from public.incident_contributing_factors f
  where f.incident_id = v_incident.id;

  delete from public.incident_contributing_factors
  where incident_id = v_incident.id;

  insert into public.incident_contributing_factors(incident_id, factor_code, created_by)
  select v_incident.id, x, p_actor_user_id
  from (
    select distinct unnest(coalesce(p_factor_codes, array[]::text[])) as x
  ) s
  where x is not null and btrim(x) <> '';

  select coalesce(jsonb_agg(f.factor_code order by f.factor_code), '[]'::jsonb)
  into v_new
  from public.incident_contributing_factors f
  where f.incident_id = v_incident.id;

  insert into public.audit_logs(
    actor_user_id, record_id, table_name, row_id, action_type,
    old_value, new_value, reason, request_meta
  ) values (
    p_actor_user_id, p_incident_record_id, 'incident_contributing_factors', v_incident.id,
    'INCIDENT_CONTRIBUTING_FACTORS_SAVE',
    jsonb_build_object('factors', v_old),
    jsonb_build_object('factors', v_new),
    'Cập nhật yếu tố góp phần trong điều tra sự cố',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_save_incident_contributing_factors_v1')
  );

  return jsonb_build_object('ok', true, 'factors', v_new);
end;
$function$

CREATE OR REPLACE FUNCTION public.qlcl_save_incident_lesson_v1(p_incident_record_id uuid, p_actor_user_id uuid, p_payload jsonb, p_publish boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

CREATE OR REPLACE FUNCTION public.qlcl_save_incident_rca_structure_v1(p_incident_record_id uuid, p_actor_user_id uuid, p_timeline jsonb DEFAULT '[]'::jsonb, p_five_whys jsonb DEFAULT '[]'::jsonb, p_fishbone jsonb DEFAULT '[]'::jsonb, p_root_causes jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_record records%rowtype;
  v_incident incidents%rowtype;
  v_rca rca_analyses%rowtype;
  v_old jsonb;
  v_timeline_count integer := 0;
  v_why_count integer := 0;
  v_fishbone_count integer := 0;
  v_root_count integer := 0;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if jsonb_typeof(coalesce(p_timeline,'[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_five_whys,'[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_fishbone,'[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_root_causes,'[]'::jsonb)) <> 'array' then
    raise exception 'RCA payload sections must be JSON arrays';
  end if;

  select * into v_record from records
  where id=p_incident_record_id and record_type='INCIDENT'
  for update;
  if not found then raise exception 'Incident record not found'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'Incident record is not active'; end if;

  select * into v_incident from incidents
  where record_id=p_incident_record_id
  for update;
  if not found then raise exception 'Incident domain row not found'; end if;
  if not coalesce(v_incident.rca_required,false) then raise exception 'Incident does not require RCA'; end if;
  if v_incident.workflow_status not in ('INVESTIGATION_REQUIRED','INVESTIGATING') then
    raise exception 'RCA can only be edited during investigation';
  end if;

  select * into v_rca from rca_analyses where incident_id=v_incident.id for update;
  if not found then
    insert into rca_analyses(incident_id,method,status,started_at)
    values(v_incident.id,'STRUCTURED_RCA','IN_PROGRESS',now())
    returning * into v_rca;
  else
    update rca_analyses
    set method='STRUCTURED_RCA', status='IN_PROGRESS', started_at=coalesce(started_at,now()), completed_at=null
    where id=v_rca.id
    returning * into v_rca;
  end if;

  select jsonb_build_object(
    'timeline', coalesce((select jsonb_agg(to_jsonb(t) order by t.sequence_no) from rca_timeline_events t where t.rca_analysis_id=v_rca.id),'[]'::jsonb),
    'five_whys', coalesce((select jsonb_agg(to_jsonb(w) order by w.why_level) from rca_five_whys w where w.rca_analysis_id=v_rca.id),'[]'::jsonb),
    'fishbone', coalesce((select jsonb_agg(to_jsonb(f) order by f.category_code,f.created_at) from rca_fishbone_factors f where f.rca_analysis_id=v_rca.id),'[]'::jsonb),
    'root_causes', coalesce((select jsonb_agg(to_jsonb(r) order by r.sequence_no) from rca_root_causes r where r.rca_analysis_id=v_rca.id),'[]'::jsonb)
  ) into v_old;

  delete from rca_timeline_events where rca_analysis_id=v_rca.id;
  delete from rca_five_whys where rca_analysis_id=v_rca.id;
  delete from rca_fishbone_factors where rca_analysis_id=v_rca.id;
  delete from rca_root_causes where rca_analysis_id=v_rca.id;

  insert into rca_timeline_events(rca_analysis_id,sequence_no,event_time,event_title,event_description,source_reference,created_by,updated_by)
  select v_rca.id, x.ord::integer,
         case when nullif(trim(x.item->>'event_time'),'') is null then null else (x.item->>'event_time')::timestamptz end,
         trim(x.item->>'event_title'), nullif(trim(x.item->>'event_description'),''), nullif(trim(x.item->>'source_reference'),''),
         p_actor_user_id,p_actor_user_id
  from jsonb_array_elements(coalesce(p_timeline,'[]'::jsonb)) with ordinality as x(item,ord)
  where length(trim(coalesce(x.item->>'event_title',''))) > 0;
  get diagnostics v_timeline_count = row_count;

  insert into rca_five_whys(rca_analysis_id,why_level,answer,evidence_note,created_by,updated_by)
  select v_rca.id, (x.item->>'why_level')::smallint, trim(x.item->>'answer'), nullif(trim(x.item->>'evidence_note'),''), p_actor_user_id,p_actor_user_id
  from jsonb_array_elements(coalesce(p_five_whys,'[]'::jsonb)) as x(item)
  where length(trim(coalesce(x.item->>'answer',''))) > 0;
  get diagnostics v_why_count = row_count;

  insert into rca_fishbone_factors(rca_analysis_id,category_code,factor_text,evidence_note,is_root_candidate,created_by,updated_by)
  select v_rca.id, upper(trim(x.item->>'category_code')), trim(x.item->>'factor_text'), nullif(trim(x.item->>'evidence_note'),''), coalesce((x.item->>'is_root_candidate')::boolean,false), p_actor_user_id,p_actor_user_id
  from jsonb_array_elements(coalesce(p_fishbone,'[]'::jsonb)) as x(item)
  where length(trim(coalesce(x.item->>'factor_text',''))) > 0;
  get diagnostics v_fishbone_count = row_count;

  insert into rca_root_causes(rca_analysis_id,sequence_no,category_code,cause_statement,evidence_basis,action_required,created_by,updated_by)
  select v_rca.id, x.ord::integer,
         nullif(upper(trim(x.item->>'category_code')),''), trim(x.item->>'cause_statement'), nullif(trim(x.item->>'evidence_basis'),''),
         coalesce((x.item->>'action_required')::boolean,true), p_actor_user_id,p_actor_user_id
  from jsonb_array_elements(coalesce(p_root_causes,'[]'::jsonb)) with ordinality as x(item,ord)
  where length(trim(coalesce(x.item->>'cause_statement',''))) > 0;
  get diagnostics v_root_count = row_count;

  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
  values(
    p_actor_user_id,p_incident_record_id,'rca_analyses',v_rca.id,'INCIDENT_RCA_STRUCTURE_SAVE',v_old,
    jsonb_build_object('timeline_count',v_timeline_count,'five_why_count',v_why_count,'fishbone_count',v_fishbone_count,'root_cause_count',v_root_count),
    'Lưu RCA có cấu trúc: Timeline → Five Why → Fishbone → Root Cause.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_save_incident_rca_structure_v1')
  );

  return jsonb_build_object(
    'ok',true,'rca_analysis_id',v_rca.id,
    'timeline_count',v_timeline_count,'five_why_count',v_why_count,'fishbone_count',v_fishbone_count,'root_cause_count',v_root_count,
    'ready', (v_timeline_count >= 1 and v_why_count >= 3 and v_fishbone_count >= 1 and v_root_count >= 1)
  );
end;
$function$

revoke execute on function public.qlcl_close_incident_v1(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.qlcl_close_incident_v1(uuid, uuid, text) to postgres, service_role;
revoke execute on function public.qlcl_complete_incident_investigation_v1(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.qlcl_complete_incident_investigation_v1(uuid, uuid, text, text, text, text) to postgres, service_role;
revoke execute on function public.qlcl_guard_incident_ready_to_close_v1() from public, anon, authenticated;
grant execute on function public.qlcl_guard_incident_ready_to_close_v1() to postgres, service_role;
revoke execute on function public.qlcl_incident_action_trace_state_v1(uuid) from public, anon, authenticated;
grant execute on function public.qlcl_incident_action_trace_state_v1(uuid) to postgres, service_role;
revoke execute on function public.qlcl_save_incident_contributing_factors_v1(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.qlcl_save_incident_contributing_factors_v1(uuid, uuid, text[]) to postgres, service_role;
revoke execute on function public.qlcl_save_incident_lesson_v1(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.qlcl_save_incident_lesson_v1(uuid, uuid, jsonb, boolean) to postgres, service_role;
revoke execute on function public.qlcl_save_incident_rca_structure_v1(uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.qlcl_save_incident_rca_structure_v1(uuid, uuid, jsonb, jsonb, jsonb, jsonb) to postgres, service_role;
