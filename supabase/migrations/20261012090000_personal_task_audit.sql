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
-- Clients must not forge history events. Only the security-definer trigger inserts them.
revoke insert,update,delete on public.personal_task_audit from anon,authenticated;
-- No update/delete policies: client cannot alter historical audit entries.

-- Database triggers guarantee that updates and audit events commit together.
-- Never trust the client to supply the actor or audit record.
create or replace function public.record_personal_task_audit()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  source_name text := case when TG_TABLE_NAME='personal_reminders' then 'reminder' else 'legacy' end;
  old_note text;
  new_note text;
begin
  if actor is null then
    -- Service-role maintenance is intentionally not attributed to an end user.
    return new;
  end if;
  if new.owner_user_id is distinct from old.owner_user_id or new.id is distinct from old.id then
    raise exception 'Task identity and owner cannot be changed';
  end if;
  if actor is distinct from new.owner_user_id then
    raise exception 'Task update actor must be the owner';
  end if;
  if TG_TABLE_NAME='personal_reminders' then
    old_note:=old.note; new_note:=new.note;
  else
    old_note:=old.content; new_note:=new.content;
  end if;
  if new_note is distinct from old_note then
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
drop trigger if exists personal_reminders_audit_update on public.personal_reminders;
create trigger personal_reminders_audit_update after update on public.personal_reminders
for each row execute function public.record_personal_task_audit();
drop trigger if exists personal_workspace_audit_update on public.personal_workspace_items;
create trigger personal_workspace_audit_update after update on public.personal_workspace_items
for each row execute function public.record_personal_task_audit();
