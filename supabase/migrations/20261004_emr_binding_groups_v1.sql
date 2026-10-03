-- "Nhóm gáy" (binding group) naming differs per hospital — it is configuration/
-- master data, not a fixed business taxonomy to hard-code (CLAUDE.md principle
-- 1). Biểu mẫu items keep storing their own group as a plain string in
-- details.binding_group (no schema change there, no migration of existing
-- data needed) — this table is only the DECLARED catalog of group names an
-- org has defined, so the master form tree page can offer a select-from-list
-- instead of free text, and let a new group be declared once instead of
-- every form re-typing its own spelling of the same group name.

create table if not exists public.emr_binding_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.emr_binding_groups enable row level security;

-- Same pattern as emr_rollout_items: RLS only gates reads to the caller's own
-- organization; writes go through the API routes using the service-role
-- admin client with an application-level emr.manage check, not RLS.
drop policy if exists qlcl_authenticated_select on public.emr_binding_groups;
create policy qlcl_authenticated_select
on public.emr_binding_groups
for select
to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));
