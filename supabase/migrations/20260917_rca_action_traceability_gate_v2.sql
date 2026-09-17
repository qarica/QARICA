-- QARICA RCA -> Action/CAPA traceability gate V2
-- Propagate CAPA Actions back to their incident source and block premature ready-to-close transitions.

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
  v_incident_record_id uuid;
  v_source_code text;
  v_count integer := 0;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if jsonb_typeof(coalesce(p_root_cause_ids,'[]'::jsonb)) <> 'array' then
    raise exception 'root_cause_ids must be a JSON array';
  end if;
  if jsonb_array_length(coalesce(p_root_cause_ids,'[]'::jsonb)) = 0 then return 0; end if;

  select record_type,record_code into v_source_type,v_source_code
  from public.records where id=p_source_record_id;
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
    v_incident_record_id := p_source_record_id;
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
    if v_rca_id is not null then
      select i.record_id into v_incident_record_id
      from public.rca_analyses r
      join public.incidents i on i.id=r.incident_id
      where r.id=v_rca_id;
    end if;
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

  if v_source_type='CAPA' and v_incident_record_id is not null then
    insert into public.record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
    select v_incident_record_id,v_action_record_id,'HAS_ACTION',
      jsonb_build_object(
        'source_record_type','INCIDENT','via_record_type','CAPA','via_record_id',p_source_record_id,
        'via_record_code',v_source_code,'root_cause_ids',p_root_cause_ids
      ),p_actor_user_id
    where not exists (
      select 1 from public.record_links l
      where l.source_record_id=v_incident_record_id
        and l.target_record_id=v_action_record_id
        and l.relation_type='HAS_ACTION'
    );
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,new_value,reason,request_meta
  ) values (
    p_actor_user_id,coalesce(v_incident_record_id,p_source_record_id),'rca_root_cause_action_links',p_action_id,'LINK_ACTION_TO_ROOT_CAUSE',
    jsonb_build_object(
      'action_id',p_action_id,'root_cause_ids',p_root_cause_ids,'link_count',v_count,
      'action_source_record_id',p_source_record_id,'incident_record_id',v_incident_record_id
    ),
    'Liên kết Action với nguyên nhân gốc RCA.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_attach_action_root_causes_v1')
  );

  return v_count;
end;
$function$;

revoke all on function public.qlcl_attach_action_root_causes_v1(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.qlcl_attach_action_root_causes_v1(uuid,uuid,uuid,jsonb) to service_role;

create or replace function public.qlcl_guard_incident_ready_to_close_v1()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
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
$function$;

drop trigger if exists trg_incident_ready_to_close_gate_v1 on public.incidents;
create trigger trg_incident_ready_to_close_gate_v1
before update of workflow_status on public.incidents
for each row execute function public.qlcl_guard_incident_ready_to_close_v1();
