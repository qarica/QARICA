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
