-- Structured RCA for incidents: timeline -> Five Why -> Fishbone -> Root Cause.
-- Additive schema + atomic save RPC + gate for RCA-required incident investigation completion.

create table if not exists public.rca_timeline_events (
  id uuid primary key default gen_random_uuid(),
  rca_analysis_id uuid not null references public.rca_analyses(id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  occurred_at timestamptz null,
  event_text text not null check (length(trim(event_text)) > 0),
  source_note text null,
  created_at timestamptz not null default now(),
  unique (rca_analysis_id, sequence_no)
);

create table if not exists public.rca_five_whys (
  id uuid primary key default gen_random_uuid(),
  rca_analysis_id uuid not null references public.rca_analyses(id) on delete cascade,
  sequence_no integer not null check (sequence_no between 1 and 5),
  answer text not null check (length(trim(answer)) > 0),
  created_at timestamptz not null default now(),
  unique (rca_analysis_id, sequence_no)
);

create table if not exists public.rca_fishbone_causes (
  id uuid primary key default gen_random_uuid(),
  rca_analysis_id uuid not null references public.rca_analyses(id) on delete cascade,
  category_code text not null check (category_code in (
    'PATIENT','STAFF','TASK_PROCESS','TEAM','EQUIPMENT_TECHNOLOGY','WORK_ENVIRONMENT','INFORMATION_COMMUNICATION','ORGANIZATION_MANAGEMENT'
  )),
  cause_text text not null check (length(trim(cause_text)) > 0),
  is_root_candidate boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.rca_root_causes (
  id uuid primary key default gen_random_uuid(),
  rca_analysis_id uuid not null references public.rca_analyses(id) on delete cascade,
  cause_text text not null check (length(trim(cause_text)) > 0),
  linked_factor_code text null check (linked_factor_code is null or linked_factor_code in (
    'PATIENT','STAFF','TASK_TECHNOLOGY','TEAM','WORK_ENVIRONMENT','INFORMATION_SYSTEMS','ORGANIZATION_MANAGEMENT','INSTITUTIONAL_CONTEXT'
  )),
  created_at timestamptz not null default now()
);

create index if not exists idx_rca_timeline_analysis on public.rca_timeline_events(rca_analysis_id, sequence_no);
create index if not exists idx_rca_whys_analysis on public.rca_five_whys(rca_analysis_id, sequence_no);
create index if not exists idx_rca_fishbone_analysis on public.rca_fishbone_causes(rca_analysis_id, category_code);
create index if not exists idx_rca_root_causes_analysis on public.rca_root_causes(rca_analysis_id);
create unique index if not exists uq_rca_analyses_incident on public.rca_analyses(incident_id) where incident_id is not null;

alter table public.rca_timeline_events enable row level security;
alter table public.rca_five_whys enable row level security;
alter table public.rca_fishbone_causes enable row level security;
alter table public.rca_root_causes enable row level security;

drop policy if exists qlcl_authenticated_select on public.rca_timeline_events;
create policy qlcl_authenticated_select on public.rca_timeline_events for select to authenticated using (true);
drop policy if exists qlcl_authenticated_select on public.rca_five_whys;
create policy qlcl_authenticated_select on public.rca_five_whys for select to authenticated using (true);
drop policy if exists qlcl_authenticated_select on public.rca_fishbone_causes;
create policy qlcl_authenticated_select on public.rca_fishbone_causes for select to authenticated using (true);
drop policy if exists qlcl_authenticated_select on public.rca_root_causes;
create policy qlcl_authenticated_select on public.rca_root_causes for select to authenticated using (true);

create or replace function public.qlcl_save_incident_rca_v1(
  p_incident_record_id uuid,
  p_actor_user_id uuid,
  p_timeline jsonb default '[]'::jsonb,
  p_five_whys jsonb default '[]'::jsonb,
  p_fishbone jsonb default '[]'::jsonb,
  p_root_causes jsonb default '[]'::jsonb,
  p_conclusion text default null,
  p_complete boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_record records%rowtype;
  v_incident incidents%rowtype;
  v_rca rca_analyses%rowtype;
  v_item jsonb;
  v_seq integer;
  v_timeline_count integer := 0;
  v_why_count integer := 0;
  v_fishbone_count integer := 0;
  v_fishbone_categories integer := 0;
  v_root_count integer := 0;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if jsonb_typeof(coalesce(p_timeline,'[]'::jsonb)) <> 'array' then raise exception 'timeline must be an array'; end if;
  if jsonb_typeof(coalesce(p_five_whys,'[]'::jsonb)) <> 'array' then raise exception 'five_whys must be an array'; end if;
  if jsonb_typeof(coalesce(p_fishbone,'[]'::jsonb)) <> 'array' then raise exception 'fishbone must be an array'; end if;
  if jsonb_typeof(coalesce(p_root_causes,'[]'::jsonb)) <> 'array' then raise exception 'root_causes must be an array'; end if;

  select * into v_record from records
  where id=p_incident_record_id and record_type='INCIDENT'
  for update;
  if not found then raise exception 'Incident record not found'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'Incident record is not active'; end if;

  select * into v_incident from incidents
  where record_id=p_incident_record_id
  for update;
  if not found then raise exception 'Incident domain row not found'; end if;
  if v_incident.workflow_status not in ('INVESTIGATION_REQUIRED','INVESTIGATING') then
    raise exception 'Structured RCA can only be edited during incident investigation';
  end if;

  select * into v_rca from rca_analyses where incident_id=v_incident.id for update;
  if not found then
    insert into rca_analyses(incident_id,method,status,started_at,conclusion)
    values(v_incident.id,'STRUCTURED_RCA_V1','IN_PROGRESS',now(),null)
    returning * into v_rca;
  end if;

  delete from rca_timeline_events where rca_analysis_id=v_rca.id;
  delete from rca_five_whys where rca_analysis_id=v_rca.id;
  delete from rca_fishbone_causes where rca_analysis_id=v_rca.id;
  delete from rca_root_causes where rca_analysis_id=v_rca.id;

  v_seq := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_timeline,'[]'::jsonb)) loop
    if coalesce(trim(v_item->>'event_text'),'') = '' then continue; end if;
    v_seq := v_seq + 1;
    insert into rca_timeline_events(rca_analysis_id,sequence_no,occurred_at,event_text,source_note)
    values(
      v_rca.id,
      v_seq,
      case when coalesce(trim(v_item->>'occurred_at'),'')='' then null else (v_item->>'occurred_at')::timestamptz end,
      trim(v_item->>'event_text'),
      nullif(trim(v_item->>'source_note'),'')
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_five_whys,'[]'::jsonb)) loop
    if coalesce(trim(v_item->>'answer'),'') = '' then continue; end if;
    v_seq := nullif(v_item->>'sequence_no','')::integer;
    if v_seq is null or v_seq < 1 or v_seq > 5 then raise exception 'Five Why sequence must be between 1 and 5'; end if;
    insert into rca_five_whys(rca_analysis_id,sequence_no,answer)
    values(v_rca.id,v_seq,trim(v_item->>'answer'));
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_fishbone,'[]'::jsonb)) loop
    if coalesce(trim(v_item->>'cause_text'),'') = '' then continue; end if;
    if coalesce(v_item->>'category_code','') not in ('PATIENT','STAFF','TASK_PROCESS','TEAM','EQUIPMENT_TECHNOLOGY','WORK_ENVIRONMENT','INFORMATION_COMMUNICATION','ORGANIZATION_MANAGEMENT') then
      raise exception 'Invalid fishbone category';
    end if;
    insert into rca_fishbone_causes(rca_analysis_id,category_code,cause_text,is_root_candidate)
    values(v_rca.id,v_item->>'category_code',trim(v_item->>'cause_text'),coalesce((v_item->>'is_root_candidate')::boolean,false));
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_root_causes,'[]'::jsonb)) loop
    if coalesce(trim(v_item->>'cause_text'),'') = '' then continue; end if;
    insert into rca_root_causes(rca_analysis_id,cause_text,linked_factor_code)
    values(v_rca.id,trim(v_item->>'cause_text'),nullif(trim(v_item->>'linked_factor_code'),''));
  end loop;

  select count(*) into v_timeline_count from rca_timeline_events where rca_analysis_id=v_rca.id;
  select count(*) into v_why_count from rca_five_whys where rca_analysis_id=v_rca.id;
  select count(*), count(distinct category_code) into v_fishbone_count, v_fishbone_categories from rca_fishbone_causes where rca_analysis_id=v_rca.id;
  select count(*) into v_root_count from rca_root_causes where rca_analysis_id=v_rca.id;

  if p_complete then
    if v_timeline_count < 2 then raise exception 'RCA completion requires at least 2 timeline events'; end if;
    if v_why_count < 3 then raise exception 'RCA completion requires at least 3 Five Why answers'; end if;
    if v_fishbone_count < 2 or v_fishbone_categories < 2 then raise exception 'RCA completion requires at least 2 Fishbone causes from 2 categories'; end if;
    if v_root_count < 1 then raise exception 'RCA completion requires at least 1 root cause'; end if;
    if coalesce(trim(p_conclusion),'') = '' then raise exception 'RCA conclusion is required'; end if;
  end if;

  update rca_analyses
  set method='STRUCTURED_RCA_V1',
      status=case when p_complete then 'COMPLETED' else 'IN_PROGRESS' end,
      started_at=coalesce(started_at,now()),
      completed_at=case when p_complete then now() else null end,
      conclusion=nullif(trim(p_conclusion),'')
  where id=v_rca.id
  returning * into v_rca;

  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
  values(
    p_actor_user_id,p_incident_record_id,'rca_analyses',v_rca.id,
    case when p_complete then 'INCIDENT_RCA_COMPLETE' else 'INCIDENT_RCA_SAVE' end,
    null,
    jsonb_build_object('status',v_rca.status,'timeline_count',v_timeline_count,'five_why_count',v_why_count,'fishbone_count',v_fishbone_count,'root_cause_count',v_root_count),
    case when p_complete then 'Hoàn tất RCA có cấu trúc.' else 'Lưu bản nháp RCA có cấu trúc.' end,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_save_incident_rca_v1')
  );

  return jsonb_build_object(
    'ok',true,'rca_analysis_id',v_rca.id,'status',v_rca.status,
    'timeline_count',v_timeline_count,'five_why_count',v_why_count,
    'fishbone_count',v_fishbone_count,'root_cause_count',v_root_count
  );
end;
$function$;

revoke all on function public.qlcl_save_incident_rca_v1(uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,boolean) from public;
grant execute on function public.qlcl_save_incident_rca_v1(uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,boolean) to service_role;

create or replace function public.qlcl_complete_incident_investigation_v1(
  p_incident_record_id uuid,
  p_actor_user_id uuid,
  p_verified_event_summary text,
  p_harm_conclusion text,
  p_conclusion text,
  p_reason text default null::text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_record records%rowtype;
  v_incident incidents%rowtype;
  v_inv incident_investigations%rowtype;
  v_reason text;
  v_rca_complete boolean := false;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_verified_event_summary),'')='' or coalesce(trim(p_harm_conclusion),'')='' or coalesce(trim(p_conclusion),'')='' then
    raise exception 'Verified event summary, harm conclusion and investigation conclusion are required';
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
  if v_incident.workflow_status <> 'INVESTIGATING' then raise exception 'Incident must be INVESTIGATING'; end if;

  select * into v_inv from incident_investigations
  where incident_id=v_incident.id and status='IN_PROGRESS'
  order by created_at desc
  limit 1
  for update;
  if not found then raise exception 'No active investigation found'; end if;

  if v_incident.rca_required then
    select exists(
      select 1 from rca_analyses r
      where r.incident_id=v_incident.id and r.status='COMPLETED'
        and exists(select 1 from rca_root_causes c where c.rca_analysis_id=r.id)
    ) into v_rca_complete;
    if not v_rca_complete then
      raise exception 'Structured RCA must be completed before investigation can be closed';
    end if;
  end if;

  update incident_investigations
  set verified_event_summary=trim(p_verified_event_summary),harm_conclusion=trim(p_harm_conclusion),
      conclusion=trim(p_conclusion),status='COMPLETED',completed_at=now()
  where id=v_inv.id;

  update incidents set workflow_status='ACTION_FOLLOW_UP',updated_at=now() where id=v_incident.id;
  v_reason:=coalesce(nullif(trim(p_reason),''),'Hoàn tất điều tra và chuyển theo dõi hành động phòng ngừa tái diễn.');

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_incident_record_id,'incidents',v_incident.id,'INCIDENT_COMPLETE_INVESTIGATION',
    jsonb_build_object('workflow_status',v_incident.workflow_status),
    jsonb_build_object('workflow_status','ACTION_FOLLOW_UP','investigation_id',v_inv.id,'rca_required',v_incident.rca_required,'rca_complete',v_rca_complete),
    v_reason,jsonb_build_object('source','qlcl-ui','sensitive',true,'transaction','qlcl_complete_incident_investigation_v1')
  );

  return jsonb_build_object('ok',true,'status','ACTION_FOLLOW_UP','investigation_id',v_inv.id,'rca_complete',v_rca_complete);
end;
$function$;
