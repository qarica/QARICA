-- Sidebar pinned nav items — per-user preference, same shape/RLS posture as
-- personal_reminders (20260921_personal_reminders_v1.sql): owner_user_id +
-- organization_id, RLS scoped to auth.uid(). A table (not localStorage) so
-- pins sync across the user's devices/sessions like every other per-user
-- preference in this app already does.
create table if not exists public.sidebar_pinned_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  owner_user_id uuid not null,
  nav_route text not null check (char_length(btrim(nav_route)) between 1 and 200),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (owner_user_id, nav_route)
);

create index if not exists idx_sidebar_pinned_items_owner
  on public.sidebar_pinned_items(owner_user_id, sort_order);

alter table public.sidebar_pinned_items enable row level security;

drop policy if exists sidebar_pinned_items_owner_select on public.sidebar_pinned_items;
create policy sidebar_pinned_items_owner_select on public.sidebar_pinned_items
for select to authenticated using ((select auth.uid()) = owner_user_id);

drop policy if exists sidebar_pinned_items_owner_insert on public.sidebar_pinned_items;
create policy sidebar_pinned_items_owner_insert on public.sidebar_pinned_items
for insert to authenticated with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.organization_id=sidebar_pinned_items.organization_id
      and p.is_active=true
  )
);

drop policy if exists sidebar_pinned_items_owner_update on public.sidebar_pinned_items;
create policy sidebar_pinned_items_owner_update on public.sidebar_pinned_items
for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.organization_id=sidebar_pinned_items.organization_id
      and p.is_active=true
  )
);

drop policy if exists sidebar_pinned_items_owner_delete on public.sidebar_pinned_items;
create policy sidebar_pinned_items_owner_delete on public.sidebar_pinned_items
for delete to authenticated using ((select auth.uid()) = owner_user_id);
