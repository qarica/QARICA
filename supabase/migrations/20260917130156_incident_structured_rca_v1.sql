create unique index if not exists uq_rca_analyses_incident_id
  on public.rca_analyses(incident_id)
  where incident_id is not null;

create table if not exists public.rca_timeline_events (
  id uuid primary key default gen_random_uuid(),
  rca_analysis_id uuid not null references public.rca_analyses(id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  event_time timestamptz,
  event_title text not null check (length(trim(event_title)) > 0),
  event_description text,
  source_reference text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rca_analysis_id, sequence_no)
);

create table if not exists public.rca_five_whys (
  id uuid primary key default gen_random_uuid(),
  rca_analysis_id uuid not null references public.rca_analyses(id) on delete cascade,
  why_level smallint not null check (why_level between 1 and 5),
  answer text not null check (length(trim(answer)) > 0),
  evidence_note text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rca_analysis_id, why_level)
);

create table if not exists public.rca_fishbone_factors (
  id uuid primary key default gen_random_uuid(),
  rca_analysis_id uuid not null references public.rca_analyses(id) on delete cascade,
  category_code text not null check (category_code in (
    'PATIENT','STAFF','TASK_TECHNOLOGY','TEAM','WORK_ENVIRONMENT',
    'INFORMATION_SYSTEMS','ORGANIZATION_MANAGEMENT','INSTITUTIONAL_CONTEXT'
  )),
  factor_text text not null check (length(trim(factor_text)) > 0),
  evidence_note text,
  is_root_candidate boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rca_root_causes (
  id uuid primary key default gen_random_uuid(),
  rca_analysis_id uuid not null references public.rca_analyses(id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  category_code text check (category_code is null or category_code in (
    'PATIENT','STAFF','TASK_TECHNOLOGY','TEAM','WORK_ENVIRONMENT',
    'INFORMATION_SYSTEMS','ORGANIZATION_MANAGEMENT','INSTITUTIONAL_CONTEXT'
  )),
  cause_statement text not null check (length(trim(cause_statement)) > 0),
  evidence_basis text,
  action_required boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rca_analysis_id, sequence_no)
);

create index if not exists idx_rca_timeline_analysis on public.rca_timeline_events(rca_analysis_id, sequence_no);
create index if not exists idx_rca_five_whys_analysis on public.rca_five_whys(rca_analysis_id, why_level);
create index if not exists idx_rca_fishbone_analysis on public.rca_fishbone_factors(rca_analysis_id, category_code);
create index if not exists idx_rca_root_causes_analysis on public.rca_root_causes(rca_analysis_id, sequence_no);

alter table public.rca_timeline_events enable row level security;
alter table public.rca_five_whys enable row level security;
alter table public.rca_fishbone_factors enable row level security;
alter table public.rca_root_causes enable row level security;

grant select on public.rca_timeline_events, public.rca_five_whys, public.rca_fishbone_factors, public.rca_root_causes to authenticated;
grant select, insert, update, delete on public.rca_timeline_events, public.rca_five_whys, public.rca_fishbone_factors, public.rca_root_causes to service_role;
revoke all on public.rca_timeline_events, public.rca_five_whys, public.rca_fishbone_factors, public.rca_root_causes from anon;

drop policy if exists qlcl_authenticated_select on public.rca_timeline_events;
create policy qlcl_authenticated_select on public.rca_timeline_events for select to authenticated using (true);
drop policy if exists qlcl_authenticated_select on public.rca_five_whys;
create policy qlcl_authenticated_select on public.rca_five_whys for select to authenticated using (true);
drop policy if exists qlcl_authenticated_select on public.rca_fishbone_factors;
create policy qlcl_authenticated_select on public.rca_fishbone_factors for select to authenticated using (true);
drop policy if exists qlcl_authenticated_select on public.rca_root_causes;
create policy qlcl_authenticated_select on public.rca_root_causes for select to authenticated using (true);

create or replace function public.qlcl_save_incident_rca_structure_v1(
  p_incident_record_id uuid,
  p_actor_user_id uuid,
  p_timeline jsonb default '[]'::jsonb,
  p_five_whys jsonb default '[]'::jsonb,
  p_fishbone jsonb default '[]'::jsonb,
  p_root_causes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
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
$$;

revoke execute on function public.qlcl_save_incident_rca_structure_v1(uuid,uuid,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.qlcl_save_incident_rca_structure_v1(uuid,uuid,jsonb,jsonb,jsonb,jsonb) to service_role;

create or replace function public.qlcl_complete_incident_investigation_v1(
  p_incident_record_id uuid,
  p_actor_user_id uuid,
  p_verified_event_summary text,
  p_harm_conclusion text,
  p_conclusion text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record records%rowtype;
  v_incident incidents%rowtype;
  v_inv incident_investigations%rowtype;
  v_rca rca_analyses%rowtype;
  v_reason text;
  v_factor_count integer := 0;
  v_timeline_count integer := 0;
  v_why_count integer := 0;
  v_fishbone_count integer := 0;
  v_root_count integer := 0;
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

  if coalesce(v_incident.rca_required,false) then
    select count(*) into v_factor_count from incident_contributing_factors where incident_id=v_incident.id;
    if v_factor_count < 1 then
      raise exception 'RCA requires at least one structured contributing factor before investigation completion';
    end if;

    select * into v_rca from rca_analyses where incident_id=v_incident.id limit 1;
    if not found then raise exception 'Structured RCA is required before investigation completion'; end if;

    select count(*) into v_timeline_count from rca_timeline_events where rca_analysis_id=v_rca.id;
    select count(*) into v_why_count from rca_five_whys where rca_analysis_id=v_rca.id;
    select count(*) into v_fishbone_count from rca_fishbone_factors where rca_analysis_id=v_rca.id;
    select count(*) into v_root_count from rca_root_causes where rca_analysis_id=v_rca.id;

    if v_timeline_count < 1 or v_why_count < 3 or v_fishbone_count < 1 or v_root_count < 1 then
      raise exception 'Structured RCA incomplete: timeline %, five-whys %, fishbone %, root-causes %. Minimum required: 1, 3, 1, 1.', v_timeline_count, v_why_count, v_fishbone_count, v_root_count;
    end if;
  end if;

  select * into v_inv from incident_investigations
  where incident_id=v_incident.id and status='IN_PROGRESS'
  order by created_at desc
  limit 1
  for update;
  if not found then raise exception 'No active investigation found'; end if;

  update incident_investigations
  set verified_event_summary=trim(p_verified_event_summary),harm_conclusion=trim(p_harm_conclusion),
      conclusion=trim(p_conclusion),status='COMPLETED',completed_at=now()
  where id=v_inv.id;

  if coalesce(v_incident.rca_required,false) then
    update rca_analyses
    set status='COMPLETED', completed_at=now(), conclusion=trim(p_conclusion)
    where id=v_rca.id;
  end if;

  update incidents set workflow_status='ACTION_FOLLOW_UP',updated_at=now() where id=v_incident.id;
  v_reason:=coalesce(nullif(trim(p_reason),''),'Hoàn tất điều tra và chuyển theo dõi hành động phòng ngừa tái diễn.');

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_incident_record_id,'incidents',v_incident.id,'INCIDENT_COMPLETE_INVESTIGATION',
    jsonb_build_object('workflow_status',v_incident.workflow_status),
    jsonb_build_object(
      'workflow_status','ACTION_FOLLOW_UP','investigation_id',v_inv.id,'contributing_factor_count',v_factor_count,
      'rca_timeline_count',v_timeline_count,'rca_five_why_count',v_why_count,'rca_fishbone_count',v_fishbone_count,'rca_root_cause_count',v_root_count
    ),
    v_reason,jsonb_build_object('source','qlcl-ui','sensitive',true,'transaction','qlcl_complete_incident_investigation_v1')
  );

  return jsonb_build_object(
    'ok',true,'status','ACTION_FOLLOW_UP','investigation_id',v_inv.id,'contributing_factor_count',v_factor_count,
    'rca_timeline_count',v_timeline_count,'rca_five_why_count',v_why_count,'rca_fishbone_count',v_fishbone_count,'rca_root_cause_count',v_root_count
  );
end;
$$;

revoke execute on function public.qlcl_complete_incident_investigation_v1(uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.qlcl_complete_incident_investigation_v1(uuid,uuid,text,text,text,text) to service_role;
