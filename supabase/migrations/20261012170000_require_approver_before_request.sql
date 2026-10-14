-- New extension requests must have a distinct designated approver.
drop policy if exists personal_task_extension_create_own on public.personal_task_extension_requests;
create policy personal_task_extension_create_own on public.personal_task_extension_requests
for insert to authenticated with check (
 owner_user_id=auth.uid() and status='PENDING' and reviewed_by is null and reviewed_at is null
 and exists(select 1 from public.personal_task_approvers a
  where a.task_source=personal_task_extension_requests.task_source
   and a.task_id=personal_task_extension_requests.task_id
   and a.owner_user_id=auth.uid() and a.approver_user_id<>auth.uid())
 and (
  (task_source='reminder' and exists(select 1 from public.personal_reminders p where p.id=task_id and p.owner_user_id=auth.uid()))
  or
  (task_source='legacy' and exists(select 1 from public.personal_workspace_items p where p.id=task_id and p.owner_user_id=auth.uid()))
 )
);
