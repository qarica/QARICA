-- Action evidence policy + private personal reminders
alter table public.actions
  add column if not exists evidence_required boolean not null default true;

comment on column public.actions.evidence_required is
  'Whether execution evidence is mandatory before submission/verification. Defaults true for backward compatibility.';

create table if not exists public.personal_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  owner_user_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  note text,
  due_at timestamptz,
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  remind_at timestamptz,
  recurrence_rule text,
  status text not null default 'OPEN' check (status in ('OPEN','COMPLETED','CANCELLED')),
  snoozed_until timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_personal_reminders_owner_due
  on public.personal_reminders(owner_user_id,status,due_at);

alter table public.personal_reminders enable row level security;

drop policy if exists personal_reminders_owner_select on public.personal_reminders;
create policy personal_reminders_owner_select on public.personal_reminders
for select using (owner_user_id = auth.uid());

drop policy if exists personal_reminders_owner_insert on public.personal_reminders;
create policy personal_reminders_owner_insert on public.personal_reminders
for insert with check (
  owner_user_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.user_id=auth.uid() and p.organization_id=personal_reminders.organization_id and p.is_active=true
  )
);

drop policy if exists personal_reminders_owner_update on public.personal_reminders;
create policy personal_reminders_owner_update on public.personal_reminders
for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists personal_reminders_owner_delete on public.personal_reminders;
create policy personal_reminders_owner_delete on public.personal_reminders
for delete using (owner_user_id = auth.uid());
