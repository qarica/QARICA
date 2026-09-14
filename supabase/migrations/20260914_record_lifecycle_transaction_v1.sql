-- QLCL-TTSG Record Lifecycle Transaction V1
-- Atomic CANCEL / ARCHIVE across domain workflow, Registry, history and audit.

begin;

create or replace function qlcl_change_record_lifecycle_v1(
  p_record_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_record records%rowtype;
  v_action text:=upper(coalesce(p_action,''));
  v_target text;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if v_action not in ('CANCEL','ARCHIVE') then raise exception 'Invalid lifecycle action'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Lifecycle reason is required'; end if;

  select * into v_record from records where id=p_record_id for update;
  if not found then raise exception 'Record not found'; end if;

  if v_action='CANCEL' then
    if v_record.lifecycle_status in ('CANCELLED','ARCHIVED','RETIRED','INACTIVE') then raise exception 'Record is already inactive'; end if;
    if v_record.lifecycle_status='CLOSED' then raise exception 'Closed record cannot be cancelled'; end if;
    v_target:='CANCELLED';

    if v_record.record_type='ACTION' then
      update actions set workflow_status='CANCELLED',updated_at=now() where record_id=p_record_id;
    elsif v_record.record_type='PROGRAM' then
      update work_programs set workflow_status='CANCELLED',updated_at=now() where record_id=p_record_id;
    elsif v_record.record_type='REPORT' then
      update reporting_obligations set workflow_status='CANCELLED',updated_at=now() where record_id=p_record_id;
    elsif v_record.record_type='MONITORING' then
      update monitoring_rounds set workflow_status='CANCELLED' where record_id=p_record_id;
    elsif v_record.record_type='FINDING' then
      update findings set workflow_status='CANCELLED',updated_at=now() where record_id=p_record_id;
    elsif v_record.record_type='CAPA' then
      update capas set workflow_status='CANCELLED',updated_at=now() where record_id=p_record_id;
    elsif v_record.record_type='INCIDENT' then
      update incidents set workflow_status='CANCELLED',updated_at=now() where record_id=p_record_id;
    elsif v_record.record_type='AUDIT' then
      update audits set workflow_status='CANCELLED',updated_at=now() where record_id=p_record_id;
    end if;
  else
    if v_record.lifecycle_status='ARCHIVED' then
      return jsonb_build_object('ok',true,'status','ARCHIVED','idempotent',true);
    end if;
    v_target:='ARCHIVED';
    if v_record.record_type='PROGRAM' then
      update work_programs set workflow_status='ARCHIVED',updated_at=now() where record_id=p_record_id;
    end if;
  end if;

  update records
  set lifecycle_status=v_target,
      closed_at=case when v_action='CANCEL' then now() else v_record.closed_at end,
      updated_at=now()
  where id=p_record_id;

  insert into record_status_history(record_id,old_status,new_status,changed_by,reason)
  values(p_record_id,v_record.lifecycle_status,v_target,p_actor_user_id,trim(p_reason));

  insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
  values(
    p_actor_user_id,p_record_id,'records',p_record_id,
    case when v_action='CANCEL' then 'CANCEL_RECORD' else 'ARCHIVE_RECORD' end,
    jsonb_build_object('lifecycle_status',v_record.lifecycle_status),
    jsonb_build_object('lifecycle_status',v_target),
    trim(p_reason),
    jsonb_build_object('source','qlcl-ui','record_type',v_record.record_type,'transaction','qlcl_change_record_lifecycle_v1')
  );

  return jsonb_build_object('ok',true,'status',v_target,'old_status',v_record.lifecycle_status,'record_type',v_record.record_type);
end;
$$;

revoke all on function qlcl_change_record_lifecycle_v1(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function qlcl_change_record_lifecycle_v1(uuid,uuid,text,text) to service_role;

commit;
