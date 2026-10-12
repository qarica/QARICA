-- Approver may read only requests explicitly assigned to them.
drop policy if exists personal_task_extension_read_own on public.personal_task_extension_requests;
create policy personal_task_extension_read_own on public.personal_task_extension_requests for select to authenticated using (
 owner_user_id=auth.uid() or exists(
 select 1 from public.personal_task_approvers a
 where a.task_source=task_source and a.task_id=task_id and a.owner_user_id=owner_user_id and a.approver_user_id=auth.uid()
 )
);
