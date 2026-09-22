-- Align the RCA save readiness signal with the investigation-completion gate.
-- Five Why is optional; when used, at least three levels are required.

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
    'ready', (v_timeline_count >= 1 and (v_why_count = 0 or v_why_count >= 3) and v_fishbone_count >= 1 and v_root_count >= 1)
  );
end;
$function$;

revoke execute on function public.qlcl_save_incident_rca_structure_v1(uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.qlcl_save_incident_rca_structure_v1(uuid, uuid, jsonb, jsonb, jsonb, jsonb) to postgres, service_role;
