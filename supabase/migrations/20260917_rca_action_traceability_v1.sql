-- QARICA RCA -> Action/CAPA traceability V1
-- Root Cause -> Action -> CAPA effectiveness -> Incident closure.

create table if not exists public.rca_root_cause_action_links (
  id uuid primary key default gen_random_uuid(),
  root_cause_id uuid not null references public.rca_root_causes(id) on delete cascade,
  action_id uuid not null references public.actions(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(root_cause_id, action_id)
);

create index if not exists idx_rca_root_cause_action_links_root
  on public.rca_root_cause_action_links(root_cause_id);
create index if not exists idx_rca_root_cause_action_links_action
  on public.rca_root_cause_action_links(action_id);

alter table public.rca_root_cause_action_links enable row level security;
revoke all on table public.rca_root_cause_action_links from public, anon, authenticated;
grant select, insert, update, delete on table public.rca_root_cause_action_links to service_role;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='capas_rca_analysis_id_fkey'
      and conrelid='public.capas'::regclass
  ) then
    alter table public.capas
      add constraint capas_rca_analysis_id_fkey
      foreign key (rca_analysis_id) references public.rca_analyses(id) on delete set null;
  end if;
end $$;

create or replace function public.qlcl_attach_action_root_causes_v1(
  p_source_record_id uuid,
  p_action_id uuid,
  p_actor_user_id uuid,
  p_root_cause_ids jsonb default '[]'::jsonb
) returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_source_type text;
  v_rca_id uuid;
  v_root_text text;
  v_root_id uuid;
  v_action_record_id uuid;
  v_count integer := 0;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if jsonb_typeof(coalesce(p_root_cause_ids,'[]'::jsonb)) <> 'array' then
    raise exception 'root_cause_ids must be a JSON array';
  end if;
  if jsonb_array_length(coalesce(p_root_cause_ids,'[]'::jsonb)) = 0 then return 0; end if;

  select record_type into v_source_type from public.records where id=p_source_record_id;
  if v_source_type is null then raise exception 'Source record not found'; end if;
  if v_source_type not in ('INCIDENT','CAPA') then
    raise exception 'Root-cause links are only supported for INCIDENT or CAPA Actions';
  end if;

  select a.record_id into v_action_record_id
  from public.actions a
  join public.records ar on ar.id=a.record_id
  join public.records sr on sr.id=p_source_record_id and sr.organization_id=ar.organization_id
  where a.id=p_action_id;
  if v_action_record_id is null then raise exception 'Action not found in source organization'; end if;

  if not exists (
    select 1 from public.record_links l
    where l.source_record_id=p_source_record_id
      and l.target_record_id=v_action_record_id
      and l.relation_type='HAS_ACTION'
  ) then raise exception 'Action is not linked to the source record'; end if;

  if v_source_type='INCIDENT' then
    select r.id into v_rca_id
    from public.incidents i
    join public.rca_analyses r on r.incident_id=i.id
    where i.record_id=p_source_record_id and r.status='COMPLETED'
    order by r.completed_at desc nulls last, r.started_at desc nulls last
    limit 1;
  else
    select c.rca_analysis_id into v_rca_id
    from public.capas c
    where c.record_id=p_source_record_id;
  end if;

  if v_rca_id is null then raise exception 'Source record has no completed/linked RCA'; end if;

  for v_root_text in
    select distinct value from jsonb_array_elements_text(coalesce(p_root_cause_ids,'[]'::jsonb))
  loop
    begin
      v_root_id := v_root_text::uuid;
    exception when others then
      raise exception 'Invalid root cause id: %', v_root_text;
    end;

    if not exists (
      select 1 from public.rca_root_causes rc
      where rc.id=v_root_id and rc.rca_analysis_id=v_rca_id
    ) then
      raise exception 'Root cause % does not belong to the source RCA', v_root_id;
    end if;

    insert into public.rca_root_cause_action_links(root_cause_id,action_id,created_by)
    values(v_root_id,p_action_id,p_actor_user_id)
    on conflict(root_cause_id,action_id) do nothing;
    v_count := v_count + 1;
  end loop;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_source_record_id,'rca_root_cause_action_links',p_action_id,'LINK_ACTION_TO_ROOT_CAUSE',
    jsonb_build_object('action_id',p_action_id,'root_cause_ids',p_root_cause_ids,'link_count',v_count),
    'Liên kết Action với nguyên nhân gốc RCA.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_attach_action_root_causes_v1')
  );

  return v_count;
end;
$function$;

revoke all on function public.qlcl_attach_action_root_causes_v1(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.qlcl_attach_action_root_causes_v1(uuid,uuid,uuid,jsonb) to service_role;

create or replace function public.qlcl_incident_action_trace_state_v1(
  p_incident_record_id uuid
) returns jsonb
language plpgsql
set search_path to 'public'
as $function$
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
$function$;

revoke all on function public.qlcl_incident_action_trace_state_v1(uuid) from public, anon, authenticated;
grant execute on function public.qlcl_incident_action_trace_state_v1(uuid) to service_role;

create or replace function public.qlcl_create_linked_action_v1(
  p_source_record_id uuid,
  p_actor_user_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_source records%rowtype;
  v_action_record_id uuid;
  v_action_id uuid;
  v_record_code text;
  v_title text:=trim(coalesce(p_payload->>'title',''));
  v_description text:=nullif(trim(coalesce(p_payload->>'description','')),'');
  v_priority text:=upper(coalesce(nullif(trim(p_payload->>'priority'),''),'NORMAL'));
  v_lead_department_id uuid;
  v_assignee_user_id uuid;
  v_start_date date;
  v_due_date date;
  v_expected_result text:=trim(coalesce(p_payload->>'expected_result',''));
  v_verification_requirement text:=nullif(trim(coalesce(p_payload->>'verification_requirement','')),'');
  v_capa_action_type text:=upper(coalesce(nullif(trim(p_payload->>'capa_action_type'),''),'CORRECTIVE'));
  v_risk_treatment_type text:=upper(coalesce(nullif(trim(p_payload->>'risk_treatment_type'),''),'REDUCE'));
  v_failure_mode_id uuid;
  v_root_id uuid;
  v_root_cause_ids jsonb:=coalesce(p_payload->'root_cause_ids','[]'::jsonb);
  v_rca_analysis_id uuid;
  v_root_link_count integer:=0;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'payload must be a JSON object'; end if;
  if jsonb_typeof(v_root_cause_ids)<>'array' then raise exception 'root_cause_ids must be a JSON array'; end if;

  select * into v_source from records where id=p_source_record_id for update;
  if not found then raise exception 'Source record not found'; end if;
  if v_source.lifecycle_status<>'ACTIVE' then raise exception 'Source record must be ACTIVE'; end if;
  if v_source.record_type not in ('DIRECTIVE','REPORT','INSPECTION','INDICATOR_MEASUREMENT','FINDING','INCIDENT','CAPA','RISK','FMEA','IMPROVEMENT_PROPOSAL','IMPROVEMENT_PROJECT','ASSESSMENT','EXTERNAL_ASSESSMENT','AUDIT','SAFETY_ALERT','FEEDBACK') then
    raise exception 'Source record type % does not support generic linked Action creation',v_source.record_type;
  end if;
  if v_title='' then raise exception 'Action title is required'; end if;
  if v_expected_result='' then raise exception 'Expected result is required'; end if;
  if v_priority not in ('LOW','NORMAL','HIGH','URGENT','CRITICAL') then raise exception 'Invalid Action priority'; end if;

  begin v_lead_department_id:=(p_payload->>'lead_department_id')::uuid; exception when others then raise exception 'Valid lead_department_id is required'; end;
  begin v_assignee_user_id:=(p_payload->>'assignee_user_id')::uuid; exception when others then raise exception 'Valid assignee_user_id is required'; end;
  begin v_due_date:=(p_payload->>'due_date')::date; exception when others then raise exception 'Valid due_date is required'; end;
  if nullif(trim(coalesce(p_payload->>'start_date','')),'') is not null then
    begin v_start_date:=(p_payload->>'start_date')::date; exception when others then raise exception 'Invalid start_date'; end;
  end if;
  if v_start_date is not null and v_due_date<v_start_date then raise exception 'due_date cannot be before start_date'; end if;
  if not exists(select 1 from departments d where d.id=v_lead_department_id and d.organization_id=v_source.organization_id and d.is_active) then raise exception 'Lead department is invalid or outside organization'; end if;
  if not exists(select 1 from profiles p where p.user_id=v_assignee_user_id and p.organization_id=v_source.organization_id and p.is_active) then raise exception 'Assignee is invalid or outside organization'; end if;
  if not exists(select 1 from profiles p where p.user_id=p_actor_user_id and p.organization_id=v_source.organization_id and p.is_active) then raise exception 'Actor is invalid or outside organization'; end if;

  if v_source.record_type='CAPA' then
    if v_capa_action_type not in ('CORRECTION','CORRECTIVE','PREVENTIVE','VERIFICATION') then raise exception 'Invalid CAPA action type'; end if;
    select rca_analysis_id into v_rca_analysis_id from capas where record_id=p_source_record_id;
    if v_rca_analysis_id is not null and v_capa_action_type in ('CORRECTIVE','PREVENTIVE') and jsonb_array_length(v_root_cause_ids)=0 then
      raise exception 'Corrective/preventive CAPA Action must be linked to at least one RCA root cause';
    end if;
  end if;
  if v_source.record_type='RISK' and v_risk_treatment_type not in ('AVOID','REDUCE','TRANSFER','ACCEPT','CONTINGENCY') then raise exception 'Invalid risk treatment type'; end if;
  if v_source.record_type='FMEA' then
    begin v_failure_mode_id:=(p_payload->>'failure_mode_id')::uuid; exception when others then raise exception 'Valid failure_mode_id is required for FMEA Action'; end;
    if not exists(
      select 1 from fmea_failure_modes fm
      join fmea_process_steps ps on ps.id=fm.process_step_id
      join fmea_studies fs on fs.id=ps.fmea_study_id
      where fm.id=v_failure_mode_id and fs.record_id=p_source_record_id
    ) then raise exception 'Failure mode not found in source FMEA'; end if;
  end if;

  select next_record_code(v_source.organization_id,'ACTION',v_source.work_year) into v_record_code;
  if coalesce(v_record_code,'')='' then raise exception 'Could not allocate Action record code'; end if;

  insert into records(organization_id,record_type,record_code,title,work_year,owner_department_id,owner_user_id,lifecycle_status,created_by)
  values(v_source.organization_id,'ACTION',v_record_code,v_title,v_source.work_year,v_lead_department_id,v_assignee_user_id,'ACTIVE',p_actor_user_id)
  returning id into v_action_record_id;

  insert into actions(record_id,title,description,priority,lead_department_id,assignee_user_id,start_date,due_date,expected_result,verification_requirement,workflow_status)
  values(v_action_record_id,v_title,v_description,v_priority,v_lead_department_id,v_assignee_user_id,v_start_date,v_due_date,v_expected_result,v_verification_requirement,'NOT_STARTED')
  returning id into v_action_id;

  insert into record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
  values(
    p_source_record_id,v_action_record_id,'HAS_ACTION',
    jsonb_strip_nulls(jsonb_build_object(
      'source_record_type',v_source.record_type,'source_record_code',v_source.record_code,
      'failure_mode_id',v_failure_mode_id,'root_cause_ids',v_root_cause_ids
    )),p_actor_user_id
  );

  if v_source.record_type='DIRECTIVE' then
    select id into v_root_id from external_directives where record_id=p_source_record_id;
    if v_root_id is null then raise exception 'Directive domain row not found'; end if;
    insert into directive_action_links(directive_id,action_id,relation_type) values(v_root_id,v_action_id,'REQUIRES');
  elsif v_source.record_type='FINDING' then
    select id into v_root_id from findings where record_id=p_source_record_id;
    if v_root_id is null then raise exception 'Finding domain row not found'; end if;
    insert into finding_action_links(finding_id,action_id,action_role) values(v_root_id,v_action_id,'CORRECTIVE');
  elsif v_source.record_type='CAPA' then
    select id into v_root_id from capas where record_id=p_source_record_id;
    if v_root_id is null then raise exception 'CAPA domain row not found'; end if;
    insert into capa_action_links(capa_id,action_id,action_type) values(v_root_id,v_action_id,v_capa_action_type);
  elsif v_source.record_type='RISK' then
    select id into v_root_id from risks where record_id=p_source_record_id;
    if v_root_id is null then raise exception 'Risk domain row not found'; end if;
    insert into risk_action_links(risk_id,action_id,treatment_type) values(v_root_id,v_action_id,v_risk_treatment_type);
  elsif v_source.record_type='INSPECTION' then
    select id into v_root_id from inspection_events where record_id=p_source_record_id;
    if v_root_id is null then raise exception 'Inspection domain row not found'; end if;
    insert into inspection_action_links(inspection_event_id,action_id,offset_days) values(v_root_id,v_action_id,null);
  elsif v_source.record_type='FMEA' then
    insert into fmea_failure_mode_action_links(failure_mode_id,action_record_id,created_by)
    values(v_failure_mode_id,v_action_record_id,p_actor_user_id);
  end if;

  if jsonb_array_length(v_root_cause_ids)>0 then
    v_root_link_count := public.qlcl_attach_action_root_causes_v1(
      p_source_record_id,v_action_id,p_actor_user_id,v_root_cause_ids
    );
  end if;

  insert into notifications(recipient_user_id,notification_type,priority,title,message,target_record_id,target_route,notification_event_key,is_read)
  values(v_assignee_user_id,'ACTION_ASSIGNED',v_priority,'Bạn được giao công việc mới',v_title||' · nguồn '||v_source.record_code,v_action_record_id,'/tasks/'||v_action_record_id,'record-action:'||p_source_record_id||':'||v_action_id||':'||v_assignee_user_id,false)
  on conflict(recipient_user_id,notification_event_key) do nothing;

  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,new_value,request_meta)
  values(
    p_actor_user_id,p_source_record_id,'record_links',v_action_record_id,'CREATE_LINKED_ACTION',
    jsonb_strip_nulls(jsonb_build_object(
      'action_record_id',v_action_record_id,'action_id',v_action_id,'title',v_title,'due_date',v_due_date,
      'assignee_user_id',v_assignee_user_id,'failure_mode_id',v_failure_mode_id,
      'root_cause_ids',v_root_cause_ids,'root_cause_link_count',v_root_link_count
    )),
    jsonb_build_object('source','qlcl-ui','source_record_type',v_source.record_type,'transaction','qlcl_create_linked_action_v1')
  );

  return jsonb_strip_nulls(jsonb_build_object(
    'ok',true,'action_id',v_action_id,'record_id',v_action_record_id,'record_code',v_record_code,
    'source_record_type',v_source.record_type,'failure_mode_id',v_failure_mode_id,'root_cause_link_count',v_root_link_count
  ));
end;
$function$;

revoke all on function public.qlcl_create_linked_action_v1(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.qlcl_create_linked_action_v1(uuid,uuid,jsonb) to service_role;

create or replace function public.qlcl_close_incident_v1(
  p_incident_record_id uuid,
  p_actor_user_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_record records%rowtype;
  v_incident incidents%rowtype;
  v_trace jsonb;
  v_action_count integer;
  v_incomplete integer;
  v_evidence integer;
  v_required_root_count integer;
  v_uncovered_root_count integer;
  v_ineffective_capa_count integer;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Incident close conclusion is required'; end if;

  select * into v_record from records
  where id=p_incident_record_id and record_type='INCIDENT'
  for update;
  if not found then raise exception 'Incident record not found'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'Incident record is not active'; end if;

  select * into v_incident from incidents
  where record_id=p_incident_record_id
  for update;
  if not found then raise exception 'Incident domain row not found'; end if;
  if v_incident.workflow_status <> 'AWAITING_CLOSURE' then raise exception 'Incident must be AWAITING_CLOSURE'; end if;

  v_trace := public.qlcl_incident_action_trace_state_v1(p_incident_record_id);
  v_action_count := coalesce((v_trace->>'action_count')::integer,0);
  v_incomplete := coalesce((v_trace->>'incomplete_action_count')::integer,0);
  v_required_root_count := coalesce((v_trace->>'required_root_count')::integer,0);
  v_uncovered_root_count := coalesce((v_trace->>'uncovered_root_count')::integer,0);
  v_ineffective_capa_count := coalesce((v_trace->>'ineffective_capa_count')::integer,0);

  if coalesce(v_incident.rca_required,false) then
    if nullif(v_trace->>'rca_analysis_id','') is null then
      raise exception 'Completed structured RCA is required before incident close';
    end if;
    if v_required_root_count < 1 then
      raise exception 'RCA must identify at least one root cause requiring action';
    end if;
    if v_uncovered_root_count > 0 then
      raise exception 'Incident has % RCA root cause(s) without an active linked Action',v_uncovered_root_count;
    end if;
    if v_ineffective_capa_count > 0 then
      raise exception 'Linked CAPA must be EFFECTIVE or CLOSED before incident close';
    end if;
  end if;

  if v_action_count < 1 then raise exception 'At least one Action is required before incident close'; end if;
  if v_incomplete > 0 then raise exception 'Incident has % incomplete Action(s)',v_incomplete; end if;

  select count(*) into v_evidence from evidence_links where record_id=p_incident_record_id;
  if v_evidence < 1 then raise exception 'Incident handling evidence is required'; end if;

  update incidents set workflow_status='CLOSED',closed_at=now(),updated_at=now() where id=v_incident.id;
  update records set lifecycle_status='CLOSED',closed_at=now(),updated_at=now() where id=p_incident_record_id;
  insert into record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_incident_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,trim(p_reason));

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_incident_record_id,'incidents',v_incident.id,'INCIDENT_CLOSE',
    jsonb_build_object('workflow_status',v_incident.workflow_status),
    jsonb_build_object('workflow_status','CLOSED','trace_state',v_trace),
    trim(p_reason),jsonb_build_object('source','qlcl-ui','sensitive',true,'transaction','qlcl_close_incident_v1')
  );

  return jsonb_build_object('ok',true,'status','CLOSED','action_count',v_action_count,'evidence_count',v_evidence,'trace_state',v_trace);
end;
$function$;

revoke all on function public.qlcl_close_incident_v1(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.qlcl_close_incident_v1(uuid,uuid,text) to service_role;
