create or replace function public.qlcl_audit_transition_v1(
  p_audit_record_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.records%rowtype;
  v_audit public.audits%rowtype;
  v_actor_org uuid;
  v_actor_active boolean;
  v_action text := upper(trim(coalesce(p_action,'')));
  v_next text;
  v_scopes integer;
  v_sessions integer;
  v_evidence integer;
begin
  if p_audit_record_id is null or p_actor_user_id is null or p_at is null or v_action='' then
    raise exception 'Required audit transition parameters are missing';
  end if;
  if v_action not in ('START','SUBMIT_REPORT','START_FOLLOW_UP') then
    raise exception 'Unsupported audit transition %',v_action;
  end if;

  select organization_id,is_active into v_actor_org,v_actor_active
  from public.profiles
  where user_id=p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active,false) then
    raise exception 'Audit actor is not active';
  end if;

  select * into v_record
  from public.records
  where id=p_audit_record_id
    and record_type='AUDIT'
  for update;
  if not found then raise exception 'Audit record not found'; end if;
  if v_record.organization_id is distinct from v_actor_org then
    raise exception 'Audit record is outside current organization';
  end if;
  if v_record.lifecycle_status <> 'ACTIVE' then
    raise exception 'Audit record is not active';
  end if;

  select * into v_audit
  from public.audits
  where record_id=p_audit_record_id
  for update;
  if not found then raise exception 'Audit domain row not found'; end if;

  if v_action='START' then
    if v_audit.workflow_status <> 'DRAFT' then
      raise exception 'Audit must be DRAFT to start';
    end if;
    select count(*) into v_scopes
    from public.audit_scopes
    where audit_id=v_audit.id;
    if v_scopes<1 then
      raise exception 'Audit scope is required before start';
    end if;
    v_next:='IN_PROGRESS';

  elsif v_action='SUBMIT_REPORT' then
    if v_audit.workflow_status <> 'IN_PROGRESS' then
      raise exception 'Audit must be IN_PROGRESS to submit report';
    end if;
    select count(*) into v_sessions
    from public.audit_sessions
    where audit_id=v_audit.id;
    if v_sessions<1 then
      raise exception 'Audit session is required before report submission';
    end if;
    select count(*) into v_evidence
    from public.evidence_links
    where record_id=p_audit_record_id;
    if v_evidence<1 then
      raise exception 'Audit evidence is required before report submission';
    end if;
    v_next:='DRAFT_REPORT';

  else
    if v_audit.workflow_status not in ('DRAFT_REPORT','REPORT_REVIEW') then
      raise exception 'Audit report must be under review before follow-up';
    end if;
    v_next:='FOLLOW_UP';
  end if;

  update public.audits
  set workflow_status=v_next,
      report_finalized_at=case
        when v_action='SUBMIT_REPORT' then p_at
        else report_finalized_at
      end,
      updated_at=p_at
  where id=v_audit.id;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  )
  values(
    p_actor_user_id,p_audit_record_id,'audits',v_audit.id,
    'AUDIT_' || v_action,
    jsonb_build_object('workflow_status',v_audit.workflow_status),
    jsonb_build_object('workflow_status',v_next),
    null,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_audit_transition_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'status',v_next,
    'action',v_action,
    'transitioned_at',p_at
  );
end;
$$;

revoke execute on function public.qlcl_audit_transition_v1(uuid,uuid,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.qlcl_audit_transition_v1(uuid,uuid,text,timestamptz)
  to service_role;
