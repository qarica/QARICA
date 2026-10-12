-- Only one outstanding request per task; avoids ambiguous competing approvals.
create unique index if not exists personal_task_extension_one_pending
on public.personal_task_extension_requests(task_source,task_id)
where status='PENDING';
