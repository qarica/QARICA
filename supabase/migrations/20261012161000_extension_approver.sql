-- Explicit per-task approver, assigned by the task owner; cannot self-approve.
create table if not exists public.personal_task_approvers(
 task_source text not null check(task_source in ('reminder','legacy')),
 task_id uuid not null,
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 approver_user_id uuid not null references auth.users(id),
 assigned_at timestamptz not null default now(),
 primary key(task_source,task_id),
 constraint personal_task_approver_not_owner check(approver_user_id<>owner_user_id)
);
alter table public.personal_task_approvers enable row level security;
drop policy if exists personal_task_approver_read on public.personal_task_approvers;
create policy personal_task_approver_read on public.personal_task_approvers for select to authenticated using(owner_user_id=auth.uid() or approver_user_id=auth.uid());
drop policy if exists personal_task_approver_owner_insert on public.personal_task_approvers;
create policy personal_task_approver_owner_insert on public.personal_task_approvers for insert to authenticated with check(owner_user_id=auth.uid() and approver_user_id<>auth.uid() and exists(select 1 from public.profiles p join public.profiles o on o.organization_id=p.organization_id where p.user_id=approver_user_id and p.is_active=true and o.user_id=auth.uid()) and ((task_source='reminder' and exists(select 1 from public.personal_reminders t where t.id=task_id and t.owner_user_id=auth.uid())) or (task_source='legacy' and exists(select 1 from public.personal_workspace_items t where t.id=task_id and t.owner_user_id=auth.uid()))));
-- Prevent changing approvers while an extension is awaiting review.
create or replace function public.prevent_pending_approver_change()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.personal_task_extension_requests e where e.task_source=old.task_source and e.task_id=old.task_id and e.status='PENDING') then raise exception 'Cannot change approver while an extension request is pending'; end if;
 return new;
end;
$$;
drop trigger if exists personal_task_approver_lock_update on public.personal_task_approvers;
create trigger personal_task_approver_lock_update before update or delete on public.personal_task_approvers for each row execute function public.prevent_pending_approver_change();
-- For initial rollout, approver mapping is immutable once assigned; reassignments require audited admin workflow.
revoke update,delete on public.personal_task_approvers from anon,authenticated;
