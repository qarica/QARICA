-- QARICA incident RCA optimistic concurrency V2.
alter table public.rca_analyses
  add column if not exists revision bigint not null default 0;

create or replace function public.qlcl_save_incident_rca_structure_v2(
  p_incident_record_id uuid,
  p_actor_user_id uuid,
  p_timeline jsonb,
  p_five_whys jsonb,
  p_fishbone jsonb,
  p_root_causes jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_record public.records%rowtype;
  v_incident public.incidents%rowtype;
  v_rca public.rca_analyses%rowtype;
  v_old jsonb;
  v_timeline_count integer := 0;
  v_why_count integer := 0;
  v_fishbone_count integer := 0;
  v_root_count integer := 0;
  v_new_revision bigint := 0;
begin
  if p_actor_user_id is null then raise exception 'Thiếu người cập nhật RCA'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'Thiếu phiên bản RCA hợp lệ'; end if;
  if jsonb_typeof(coalesce(p_timeline,'[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_five_whys,'[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_fishbone,'[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_root_causes,'[]'::jsonb)) <> 'array' then
    raise exception 'Dữ liệu RCA phải là các danh sách hợp lệ';
  end if;

  select r.* into v_record
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_incident_record_id
    and r.record_type='INCIDENT'
    and p.user_id=p_actor_user_id
    and p.is_active=true
  for update of r;

  if not found then raise exception 'Sự cố không thuộc phạm vi tổ chức hiện tại hoặc tài khoản đã ngưng'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'Hồ sơ sự cố không còn hoạt động'; end if;

  select * into v_incident
  from public.incidents
  where record_id=p_incident_record_id
  for update;

  if not found then raise exception 'Không tìm thấy dữ liệu sự cố'; end if;
  if not coalesce(v_incident.rca_required,false) then raise exception 'Sự cố này chưa được xác định là cần RCA'; end if;
  if v_incident.workflow_status not in ('INVESTIGATION_REQUIRED','INVESTIGATING') then
    raise exception 'Chỉ được sửa RCA trong giai đoạn điều tra';
  end if;

  select * into v_rca
  from public.rca_analyses
  where incident_id=v_incident.id
  for update;

  if not found then
    if p_expected_revision <> 0 then
      raise exception 'RCA đã được tạo/cập nhật ở phiên làm việc khác. Hãy tải lại dữ liệu trước khi lưu.';
    end if;
    insert into public.rca_analyses(incident_id,method,status,started_at,revision)
    values(v_incident.id,'STRUCTURED_RCA','IN_PROGRESS',now(),1)
    returning * into v_rca;
    v_new_revision := 1;
  else
    if v_rca.revision <> p_expected_revision then
      raise exception 'RCA đã được người khác cập nhật. Hãy tải lại để xem phiên bản mới trước khi lưu.';
    end if;
    update public.rca_analyses
    set method='STRUCTURED_RCA',
        status='IN_PROGRESS',
        started_at=coalesce(started_at,now()),
        completed_at=null,
        revision=revision+1
    where id=v_rca.id
      and revision=p_expected_revision
    returning * into v_rca;
    if not found then
      raise exception 'RCA đã thay đổi trong lúc lưu. Hãy tải lại và thử lại.';
    end if;
    v_new_revision := v_rca.revision;
  end if;

  select jsonb_build_object(
    'timeline', coalesce((select jsonb_agg(to_jsonb(t) order by t.sequence_no) from public.rca_timeline_events t where t.rca_analysis_id=v_rca.id),'[]'::jsonb),
    'five_whys', coalesce((select jsonb_agg(to_jsonb(w) order by w.why_level) from public.rca_five_whys w where w.rca_analysis_id=v_rca.id),'[]'::jsonb),
    'fishbone', coalesce((select jsonb_agg(to_jsonb(f) order by f.category_code,f.created_at) from public.rca_fishbone_factors f where f.rca_analysis_id=v_rca.id),'[]'::jsonb),
    'root_causes', coalesce((select jsonb_agg(to_jsonb(r) order by r.sequence_no) from public.rca_root_causes r where r.rca_analysis_id=v_rca.id),'[]'::jsonb)
  ) into v_old;

  delete from public.rca_timeline_events where rca_analysis_id=v_rca.id;
  delete from public.rca_five_whys where rca_analysis_id=v_rca.id;
  delete from public.rca_fishbone_factors where rca_analysis_id=v_rca.id;
  delete from public.rca_root_causes where rca_analysis_id=v_rca.id;

  insert into public.rca_timeline_events(rca_analysis_id,sequence_no,event_time,event_title,event_description,source_reference,created_by,updated_by)
  select v_rca.id,x.ord::integer,
         case when nullif(trim(x.item->>'event_time'),'') is null then null else (x.item->>'event_time')::timestamptz end,
         trim(x.item->>'event_title'),nullif(trim(x.item->>'event_description'),''),nullif(trim(x.item->>'source_reference'),''),
         p_actor_user_id,p_actor_user_id
  from jsonb_array_elements(coalesce(p_timeline,'[]'::jsonb)) with ordinality as x(item,ord)
  where length(trim(coalesce(x.item->>'event_title',''))) > 0;
  get diagnostics v_timeline_count = row_count;

  insert into public.rca_five_whys(rca_analysis_id,why_level,answer,evidence_note,created_by,updated_by)
  select v_rca.id,(x.item->>'why_level')::smallint,trim(x.item->>'answer'),nullif(trim(x.item->>'evidence_note'),''),p_actor_user_id,p_actor_user_id
  from jsonb_array_elements(coalesce(p_five_whys,'[]'::jsonb)) as x(item)
  where length(trim(coalesce(x.item->>'answer',''))) > 0;
  get diagnostics v_why_count = row_count;

  insert into public.rca_fishbone_factors(rca_analysis_id,category_code,factor_text,evidence_note,is_root_candidate,created_by,updated_by)
  select v_rca.id,upper(trim(x.item->>'category_code')),trim(x.item->>'factor_text'),nullif(trim(x.item->>'evidence_note'),''),coalesce((x.item->>'is_root_candidate')::boolean,false),p_actor_user_id,p_actor_user_id
  from jsonb_array_elements(coalesce(p_fishbone,'[]'::jsonb)) as x(item)
  where length(trim(coalesce(x.item->>'factor_text',''))) > 0;
  get diagnostics v_fishbone_count = row_count;

  insert into public.rca_root_causes(rca_analysis_id,sequence_no,category_code,cause_statement,evidence_basis,action_required,created_by,updated_by)
  select v_rca.id,x.ord::integer,nullif(upper(trim(x.item->>'category_code')),''),trim(x.item->>'cause_statement'),nullif(trim(x.item->>'evidence_basis'),''),coalesce((x.item->>'action_required')::boolean,true),p_actor_user_id,p_actor_user_id
  from jsonb_array_elements(coalesce(p_root_causes,'[]'::jsonb)) with ordinality as x(item,ord)
  where length(trim(coalesce(x.item->>'cause_statement',''))) > 0;
  get diagnostics v_root_count = row_count;

  insert into public.audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
  values(
    p_actor_user_id,p_incident_record_id,'rca_analyses',v_rca.id,'INCIDENT_RCA_STRUCTURE_SAVE',v_old,
    jsonb_build_object(
      'timeline_count',v_timeline_count,
      'five_why_count',v_why_count,
      'fishbone_count',v_fishbone_count,
      'root_cause_count',v_root_count,
      'revision',v_new_revision
    ),
    'Lưu RCA có cấu trúc với kiểm soát phiên bản.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_save_incident_rca_structure_v2')
  );

  return jsonb_build_object(
    'ok',true,
    'rca_analysis_id',v_rca.id,
    'revision',v_new_revision,
    'timeline_count',v_timeline_count,
    'five_why_count',v_why_count,
    'fishbone_count',v_fishbone_count,
    'root_cause_count',v_root_count,
    'ready',(v_timeline_count>=1 and (v_why_count=0 or v_why_count>=3) and v_fishbone_count>=1 and v_root_count>=1)
  );
end;
$function$;

revoke all on function public.qlcl_save_incident_rca_structure_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb,bigint)
  from public,anon,authenticated;
grant execute on function public.qlcl_save_incident_rca_structure_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb,bigint)
  to service_role;
