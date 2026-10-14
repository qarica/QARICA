-- RECONCILIATION: đã áp trực tiếp lên Supabase sống ngày 2026-10-12, không qua repo.
-- User-requested deadline extension with reason; no silent deadline changes.
create table if not exists public.personal_task_extension_requests (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 task_source text not null check (task_source in ('reminder','legacy')),
 task_id uuid not null,
 requested_due_at timestamptz not null,
 reason text not null check(length(btrim(reason))>=5),
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),
 requested_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 review_note text
);
create index if not exists personal_task_extension_requests_task_idx on public.personal_task_extension_requests(owner_user_id,task_source,task_id,requested_at desc);
alter table public.personal_task_extension_requests enable row level security;
drop policy if exists personal_task_extension_read_own on public.personal_task_extension_requests;
create policy personal_task_extension_read_own on public.personal_task_extension_requests for select to authenticated using(owner_user_id=auth.uid());
drop policy if exists personal_task_extension_create_own on public.personal_task_extension_requests;
create policy personal_task_extension_create_own on public.personal_task_extension_requests for insert to authenticated with check(owner_user_id=auth.uid() and status='PENDING' and reviewed_by is null and reviewed_at is null and ((task_source='reminder' and exists(select 1 from public.personal_reminders p where p.id=task_id and p.owner_user_id=auth.uid())) or (task_source='legacy' and exists(select 1 from public.personal_workspace_items p where p.id=task_id and p.owner_user_id=auth.uid()))));
revoke update,delete on public.personal_task_extension_requests from anon,authenticated;
create or replace function public.record_personal_task_extension_request()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.personal_task_audit(owner_user_id,task_source,task_id,actor_user_id,event_type,next_value,reason)
 values(new.owner_user_id,new.task_source,new.task_id,auth.uid(),'EXTENSION_REQUEST',jsonb_build_object('requested_due_at',new.requested_due_at,'status',new.status),new.reason);
 return new;
end;
$$;
drop trigger if exists personal_task_extension_audit_insert on public.personal_task_extension_requests;
create trigger personal_task_extension_audit_insert after insert on public.personal_task_extension_requests for each row execute function public.record_personal_task_extension_request();
