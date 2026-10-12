-- Only the explicitly assigned approver may approve/reject.
-- Row locking and transaction ensure the decision and due-date update are atomic.
create or replace function public.review_personal_task_extension(p_request_id uuid,p_approve boolean,p_review_note text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
 req public.personal_task_extension_requests%rowtype;
 actor uuid:=auth.uid();
begin
 if actor is null then raise exception 'Authentication required'; end if;
 select * into req from public.personal_task_extension_requests where id=p_request_id for update;
 if not found then raise exception 'Request not found'; end if;
 if req.status<>'PENDING' then raise exception 'Request already reviewed'; end if;
 if req.owner_user_id=actor then raise exception 'Self-approval is not permitted'; end if;
 if not exists(select 1 from public.personal_task_approvers a where a.task_source=req.task_source and a.task_id=req.task_id and a.owner_user_id=req.owner_user_id and a.approver_user_id=actor) then
  raise exception 'Not the designated approver';
 end if;
 if not p_approve and length(btrim(coalesce(p_review_note,'')))<5 then raise exception 'Rejection reason required'; end if;
 if p_approve then
  -- Audit trigger accepts owner updates; the designated approver updates due_at
  -- via this security-definer RPC. Local flag is only read inside the trigger.
  perform set_config('qarica.extension_review','true',true);
  if req.task_source='reminder' then
   update public.personal_reminders set due_at=req.requested_due_at where id=req.task_id and owner_user_id=req.owner_user_id;
  else
   update public.personal_workspace_items set due_at=req.requested_due_at where id=req.task_id and owner_user_id=req.owner_user_id;
  end if;
  if not found then raise exception 'Task no longer exists'; end if;
 end if;
 update public.personal_task_extension_requests
 set status=case when p_approve then 'APPROVED' else 'REJECTED' end,
 reviewed_by=actor,reviewed_at=now(),review_note=nullif(btrim(coalesce(p_review_note,'')),'')
 where id=p_request_id;
 insert into public.personal_task_audit(owner_user_id,task_source,task_id,actor_user_id,event_type,next_value,reason)
 values(req.owner_user_id,req.task_source,req.task_id,actor,'EXTENSION_APPROVAL',jsonb_build_object('request_id',p_request_id,'status',case when p_approve then 'APPROVED' else 'REJECTED' end,'requested_due_at',req.requested_due_at),p_review_note);
end;
$$;
revoke all on function public.review_personal_task_extension(uuid,boolean,text) from public,anon;
grant execute on function public.review_personal_task_extension(uuid,boolean,text) to authenticated;

-- The existing task audit trigger must permit this narrowly authorized RPC path.
create or replace function public.record_personal_task_audit()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
 actor uuid:=auth.uid();
 source_name text:=case when TG_TABLE_NAME='personal_reminders' then 'reminder' else 'legacy' end;
 old_note text;
 new_note text;
 approved_extension boolean:=false;
begin
 if actor is null then return new; end if;
 if new.owner_user_id is distinct from old.owner_user_id or new.id is distinct from old.id then raise exception 'Task identity and owner cannot be changed'; end if;
 if actor is distinct from new.owner_user_id then
  approved_extension:=current_setting('qarica.extension_review',true)='true'
   and new.due_at is distinct from old.due_at
   and new.status is not distinct from old.status
   and new.completed_at is not distinct from old.completed_at
   and exists(select 1 from public.personal_task_extension_requests e
     join public.personal_task_approvers a on a.task_source=e.task_source and a.task_id=e.task_id and a.owner_user_id=e.owner_user_id
     where e.task_source=source_name and e.task_id=new.id and e.owner_user_id=new.owner_user_id
     and e.status='PENDING' and e.requested_due_at=new.due_at and a.approver_user_id=actor);
  if not approved_extension then raise exception 'Task update actor must be the owner'; end if;
 end if;
 if TG_TABLE_NAME='personal_reminders' then old_note:=old.note;new_note:=new.note;
 else old_note:=old.content;new_note:=new.content;end if;
 if new_note is distinct from old_note then
  if approved_extension then raise exception 'Extension review cannot edit notes'; end if;
  insert into public.personal_task_audit(owner_user_id,task_source,task_id,actor_user_id,event_type,previous_value,next_value)
  values(new.owner_user_id,source_name,new.id,actor,'PROGRESS',jsonb_build_object('note',old_note),jsonb_build_object('note',new_note));
 end if;
 if new.status is distinct from old.status then
  insert into public.personal_task_audit(owner_user_id,task_source,task_id,actor_user_id,event_type,previous_value,next_value)
  values(new.owner_user_id,source_name,new.id,actor,'STATUS',jsonb_build_object('status',old.status),jsonb_build_object('status',new.status));
 end if;
 if new.due_at is distinct from old.due_at then
  insert into public.personal_task_audit(owner_user_id,task_source,task_id,actor_user_id,event_type,previous_value,next_value)
  values(new.owner_user_id,source_name,new.id,actor,'DUE_DATE',jsonb_build_object('due_at',old.due_at),jsonb_build_object('due_at',new.due_at));
 end if;
 if new.completed_at is distinct from old.completed_at then
  insert into public.personal_task_audit(owner_user_id,task_source,task_id,actor_user_id,event_type,previous_value,next_value)
  values(new.owner_user_id,source_name,new.id,actor,'COMPLETION',jsonb_build_object('completed_at',old.completed_at),jsonb_build_object('completed_at',new.completed_at));
 end if;
 return new;
end;
$$;
