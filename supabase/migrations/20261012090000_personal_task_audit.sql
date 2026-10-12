-- Append-only audit trail for personal tasks. Does not modify or delete existing notes.
create table if not exists public.personal_task_audit (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 task_source text not null check (task_source in ('reminder','legacy')),
 task_id uuid not null,
 actor_user_id uuid not null references auth.users(id),
 event_type text not null check (event_type in ('PROGRESS','STATUS','DUE_DATE','COMPLETION','EXTENSION_REQUEST','EXTENSION_APPROVAL')),
 previous_value jsonb,
 next_value jsonb,
 reason text,
 created_at timestamptz not null default now()
);
create index if not exists personal_task_audit_task_idx on public.personal_task_audit(owner_user_id,task_source,task_id,created_at desc);
alter table public.personal_task_audit enable row level security;
drop policy if exists personal_task_audit_select_own on public.personal_task_audit;
create policy personal_task_audit_select_own on public.personal_task_audit for select to authenticated using (owner_user_id=auth.uid());
drop policy if exists personal_task_audit_insert_own on public.personal_task_audit;
create policy personal_task_audit_insert_own on public.personal_task_audit for insert to authenticated with check (owner_user_id=auth.uid() and actor_user_id=auth.uid() and ((task_source='reminder' and exists(select 1 from public.personal_reminders p where p.id=task_id and p.owner_user_id=auth.uid())) or (task_source='legacy' and exists(select 1 from public.personal_workspace_items p where p.id=task_id and p.owner_user_id=auth.uid()))));
-- No update/delete policies: client cannot alter historical audit entries.
