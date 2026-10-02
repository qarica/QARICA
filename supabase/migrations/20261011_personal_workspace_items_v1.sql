-- Personal workspace: private tasks/notes owned by a single user, independent
-- of any organization — survives the user's profile.organization_id changing
-- (e.g. switching hospitals) because the table has no organization_id column
-- and RLS only ever checks owner_user_id, unlike personal_reminders.
create table if not exists public.personal_workspace_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  item_type text not null check (item_type in ('TASK','NOTE')),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  content text,
  category text,
  due_at timestamptz,
  status text not null default 'OPEN' check (status in ('OPEN','DONE')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_personal_workspace_items_owner_status
  on public.personal_workspace_items(owner_user_id,status,due_at);

alter table public.personal_workspace_items enable row level security;

drop policy if exists personal_workspace_items_owner_select on public.personal_workspace_items;
create policy personal_workspace_items_owner_select on public.personal_workspace_items
for select to authenticated using ((select auth.uid()) = owner_user_id);

drop policy if exists personal_workspace_items_owner_insert on public.personal_workspace_items;
create policy personal_workspace_items_owner_insert on public.personal_workspace_items
for insert to authenticated with check ((select auth.uid()) = owner_user_id);

drop policy if exists personal_workspace_items_owner_update on public.personal_workspace_items;
create policy personal_workspace_items_owner_update on public.personal_workspace_items
for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

drop policy if exists personal_workspace_items_owner_delete on public.personal_workspace_items;
create policy personal_workspace_items_owner_delete on public.personal_workspace_items
for delete to authenticated using ((select auth.uid()) = owner_user_id);
