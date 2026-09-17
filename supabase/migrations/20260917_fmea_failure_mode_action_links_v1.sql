-- QARICA FMEA failure-mode Action traceability V1
-- Additive: links an existing ACTION record to the exact FMEA failure mode it addresses.
create table if not exists fmea_failure_mode_action_links (
  id uuid primary key default gen_random_uuid(),
  failure_mode_id uuid not null references fmea_failure_modes(id) on delete cascade,
  action_record_id uuid not null references records(id) on delete cascade,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (failure_mode_id, action_record_id)
);
create index if not exists idx_fmea_mode_action_links_mode on fmea_failure_mode_action_links(failure_mode_id);
create index if not exists idx_fmea_mode_action_links_action on fmea_failure_mode_action_links(action_record_id);
alter table fmea_failure_mode_action_links enable row level security;

-- Harden FMEA close: every high-priority failure mode must have its own Action link,
-- its linked Actions must be complete, and it must have a residual reassessment.
create or replace function qlcl_close_fmea_v1(p_fmea_record_id uuid,p_actor_user_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_record records%rowtype;v_study fmea_studies%rowtype;v_high integer;v_residual integer;v_linked_modes integer;v_incomplete integer;v_evidence integer;begin
 if p_actor_user_id is null then raise exception 'actor_user_id is required';end if;
 if coalesce(trim(p_reason),'')='' then raise exception 'Residual risk acceptance conclusion is required';end if;
 select * into v_record from records where id=p_fmea_record_id and record_type='FMEA' for update;
 if not found then raise exception 'FMEA record not found';end if;
 if v_record.lifecycle_status<>'ACTIVE' then raise exception 'FMEA record is not active';end if;
 select * into v_study from fmea_studies where record_id=p_fmea_record_id for update;
 if not found then raise exception 'FMEA study not found';end if;
 if v_study.workflow_status<>'RESIDUAL_REVIEW' then raise exception 'FMEA must be RESIDUAL_REVIEW before close';end if;
 select count(*) into v_high from fmea_failure_modes fm join fmea_process_steps ps on ps.id=fm.process_step_id where ps.fmea_study_id=v_study.id and coalesce(fm.is_high_priority,false)=true;
 select count(distinct fm.id) into v_residual from fmea_failure_modes fm join fmea_process_steps ps on ps.id=fm.process_step_id join fmea_mode_assessments a on a.failure_mode_id=fm.id and a.assessment_type='RESIDUAL' where ps.fmea_study_id=v_study.id and coalesce(fm.is_high_priority,false)=true;
 if v_residual<v_high then raise exception 'Residual reassessment is required for every high-priority failure mode (%/% completed)',v_residual,v_high;end if;
 select count(distinct fm.id) into v_linked_modes from fmea_failure_modes fm join fmea_process_steps ps on ps.id=fm.process_step_id join fmea_failure_mode_action_links ml on ml.failure_mode_id=fm.id join record_links rl on rl.source_record_id=p_fmea_record_id and rl.target_record_id=ml.action_record_id and rl.relation_type='HAS_ACTION' where ps.fmea_study_id=v_study.id and coalesce(fm.is_high_priority,false)=true;
 if v_linked_modes<v_high then raise exception 'Every high-priority failure mode requires its own linked Action (%/% linked)',v_linked_modes,v_high;end if;
 select count(*) into v_incomplete from fmea_failure_mode_action_links ml join fmea_failure_modes fm on fm.id=ml.failure_mode_id join fmea_process_steps ps on ps.id=fm.process_step_id join actions a on a.record_id=ml.action_record_id where ps.fmea_study_id=v_study.id and coalesce(fm.is_high_priority,false)=true and coalesce(a.workflow_status,'') not in('COMPLETED','CANCELLED','NOT_APPLICABLE');
 if v_incomplete>0 then raise exception 'FMEA has % incomplete high-priority failure-mode Action(s)',v_incomplete;end if;
 select count(*) into v_evidence from evidence_links where record_id=p_fmea_record_id;
 if v_evidence<1 then raise exception 'FMEA intervention/re-score evidence is required';end if;
 update fmea_studies set workflow_status='CLOSED',updated_at=now() where id=v_study.id;
 update records set lifecycle_status='CLOSED',closed_at=now(),updated_at=now() where id=p_fmea_record_id;
 insert into record_status_history(record_id,old_status,new_status,changed_by,reason) values(p_fmea_record_id,v_record.lifecycle_status,'CLOSED',p_actor_user_id,trim(p_reason));
 insert into audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta) values(p_actor_user_id,p_fmea_record_id,'fmea_studies',v_study.id,'FMEA_CLOSE',jsonb_build_object('workflow_status',v_study.workflow_status),jsonb_build_object('workflow_status','CLOSED','residual_reassessed',v_residual,'high_priority_modes',v_high,'high_priority_modes_with_action',v_linked_modes),trim(p_reason),jsonb_build_object('source','qlcl-ui','transaction','qlcl_close_fmea_v1'));
 return jsonb_build_object('ok',true,'status','CLOSED','high_priority_modes',v_high,'high_priority_modes_with_action',v_linked_modes,'evidence_count',v_evidence,'residual_reassessed',v_residual);
end;$$;
revoke all on function qlcl_close_fmea_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function qlcl_close_fmea_v1(uuid,uuid,text) to service_role;
