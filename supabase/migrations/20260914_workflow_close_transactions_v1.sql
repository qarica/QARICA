-- QLCL-TTSG Workflow Close Transactions V1
-- Scope: atomic close operations for Finding, CAPA and Inspection.
-- IMPORTANT: apply only after backup + preflight + preview CI PASS.

begin;

create or replace function qlcl_accept_and_close_finding_v1(
  p_finding_record_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record records%rowtype;
  v_finding findings%rowtype;
  v_verification_no integer;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Verification comment is required'; end if;

  select * into v_record from records
  where id=p_finding_record_id and record_type='FINDING'
  for update;
  if not found then raise exception 'Finding record not found'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'Finding record is not active'; end if;

  select * into v_finding from findings
  where record_id=p_finding_record_id
  for update;
  if not found then raise exception 'Finding domain row not found'; end if;
  if v_finding.workflow_status <> 'VERIFYING' then raise exception 'Finding must be VERIFYING before ACCEPT'; end if;

  select coalesce(max(verification_no),0)+1 into v_verification_no
  from finding_verifications where finding_id=v_finding.id;

  insert into finding_verifications(
    finding_id,verification_no,reviewer_user_id,result,comment
  ) values (
    v_finding.id,v_verification_no,p_actor_user_id,'ACCEPTED',trim(p_reason)
  );

  update findings
  set workflow_status='CLOSED',confirmed_by=p_actor_user_id,confirmed_at=now(),updated_at=now()
  where id=v_finding.id;

  update records
  set lifecycle_status='CLOSED',closed_at=now(),updated_at=now()
  where id=p_finding_record_id;

  insert into record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_finding_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,trim(p_reason));

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_finding_record_id,'findings',v_finding.id,'FINDING_ACCEPT',
    jsonb_build_object('workflow_status',v_finding.workflow_status),
    jsonb_build_object('workflow_status','CLOSED','verification_no',v_verification_no),
    trim(p_reason),jsonb_build_object('source','qlcl-ui','transaction','qlcl_accept_and_close_finding_v1')
  );

  return jsonb_build_object('ok',true,'status','CLOSED','verification_no',v_verification_no);
end;
$$;

create or replace function qlcl_close_capa_v1(
  p_capa_record_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record records%rowtype;
  v_capa capas%rowtype;
  v_reason text;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  v_reason := coalesce(nullif(trim(p_reason),''),'CAPA đã được xác nhận hiệu lực.');

  select * into v_record from records
  where id=p_capa_record_id and record_type='CAPA'
  for update;
  if not found then raise exception 'CAPA record not found'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'CAPA record is not active'; end if;

  select * into v_capa from capas
  where record_id=p_capa_record_id
  for update;
  if not found then raise exception 'CAPA domain row not found'; end if;
  if v_capa.workflow_status <> 'EFFECTIVE' then raise exception 'Only EFFECTIVE CAPA may be closed'; end if;

  update capas
  set workflow_status='CLOSED',closed_at=now(),updated_at=now()
  where id=v_capa.id;

  update records
  set lifecycle_status='CLOSED',closed_at=now(),updated_at=now()
  where id=p_capa_record_id;

  insert into record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_capa_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,v_reason);

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_capa_record_id,'capas',v_capa.id,'CAPA_CLOSE',
    jsonb_build_object('workflow_status',v_capa.workflow_status),
    jsonb_build_object('workflow_status','CLOSED'),
    v_reason,jsonb_build_object('source','qlcl-ui','transaction','qlcl_close_capa_v1')
  );

  return jsonb_build_object('ok',true,'status','CLOSED');
end;
$$;

create or replace function qlcl_close_inspection_v1(
  p_inspection_record_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record records%rowtype;
  v_event inspection_events%rowtype;
  v_incomplete integer;
  v_evidence integer;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Inspection close conclusion is required'; end if;

  select * into v_record from records
  where id=p_inspection_record_id and record_type='INSPECTION'
  for update;
  if not found then raise exception 'Inspection record not found'; end if;
  if v_record.lifecycle_status <> 'ACTIVE' then raise exception 'Inspection record is not active'; end if;

  select * into v_event from inspection_events
  where record_id=p_inspection_record_id
  for update;
  if not found then raise exception 'Inspection event not found'; end if;
  if v_event.workflow_status <> 'FOLLOW_UP' then raise exception 'Inspection must be FOLLOW_UP before close'; end if;

  select count(*) into v_incomplete
  from inspection_action_links l
  join actions a on a.id=l.action_id
  where l.inspection_event_id=v_event.id
    and coalesce(a.workflow_status,'') not in ('COMPLETED','CANCELLED','NOT_APPLICABLE');
  if v_incomplete > 0 then raise exception 'Inspection has % incomplete Action(s)',v_incomplete; end if;

  select count(*) into v_evidence
  from evidence_links where record_id=p_inspection_record_id;
  if v_evidence < 1 then raise exception 'Inspection evidence is required before close'; end if;

  update inspection_events
  set workflow_status='CLOSED',updated_at=now()
  where id=v_event.id;

  update records
  set lifecycle_status='CLOSED',closed_at=now(),updated_at=now()
  where id=p_inspection_record_id;

  insert into record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_inspection_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,trim(p_reason));

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_inspection_record_id,'inspection_events',v_event.id,'INSPECTION_CLOSE',
    jsonb_build_object('workflow_status',v_event.workflow_status),
    jsonb_build_object('workflow_status','CLOSED'),
    trim(p_reason),jsonb_build_object('source','qlcl-ui','transaction','qlcl_close_inspection_v1')
  );

  return jsonb_build_object('ok',true,'status','CLOSED','evidence_count',v_evidence);
end;
$$;

revoke all on function qlcl_accept_and_close_finding_v1(uuid,uuid,text) from public;
revoke all on function qlcl_accept_and_close_finding_v1(uuid,uuid,text) from anon;
revoke all on function qlcl_accept_and_close_finding_v1(uuid,uuid,text) from authenticated;
grant execute on function qlcl_accept_and_close_finding_v1(uuid,uuid,text) to service_role;

revoke all on function qlcl_close_capa_v1(uuid,uuid,text) from public;
revoke all on function qlcl_close_capa_v1(uuid,uuid,text) from anon;
revoke all on function qlcl_close_capa_v1(uuid,uuid,text) from authenticated;
grant execute on function qlcl_close_capa_v1(uuid,uuid,text) to service_role;

revoke all on function qlcl_close_inspection_v1(uuid,uuid,text) from public;
revoke all on function qlcl_close_inspection_v1(uuid,uuid,text) from anon;
revoke all on function qlcl_close_inspection_v1(uuid,uuid,text) from authenticated;
grant execute on function qlcl_close_inspection_v1(uuid,uuid,text) to service_role;

commit;
