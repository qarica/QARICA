-- EMR rollout tracking module (rebuilt properly this time, integrated into the real app -
-- the previous scaffold at repo-root app/emr was a raw, unintegrated upload that broke
-- routing entirely and is gone). One shared table serves all 8 categories, following the
-- same "shared engine, not one module per item" pattern used elsewhere in QARICA
-- (checklist templates, quality gates) rather than 8 near-duplicate mini-tables.

create table if not exists public.emr_rollout_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  category text not null check (category in (
    'CHU_KY_SO','NHAP_LIEU','DAO_TAO','THIET_BI_YTE','QUY_TRINH','BIEU_MAU','LOI','THIET_BI_CNTT'
  )),
  title text not null,
  description text,
  status text not null default 'TODO' check (status in ('TODO','IN_PROGRESS','DONE','BLOCKED')),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists emr_rollout_items_org_category_idx
  on public.emr_rollout_items(organization_id, category);

alter table public.emr_rollout_items enable row level security;

-- Read access for every authenticated user in the same organization (module is open to
-- "tất cả người dùng" per requirement - no granular permission code for this module).
-- All writes go through the API routes below using the service-role admin client, matching
-- this app's established pattern (checked in a lightweight code-level auth check, not RLS).
drop policy if exists qlcl_authenticated_select on public.emr_rollout_items;
create policy qlcl_authenticated_select
on public.emr_rollout_items
for select
to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));
