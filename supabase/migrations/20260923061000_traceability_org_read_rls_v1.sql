-- Scope generic traceability metadata to the signed-in user's active organization.
-- The table already carries organization_id across all domain link types.

drop policy if exists qlcl_authenticated_select on public.quality_traceability_links;
drop policy if exists qlcl_traceability_org_select on public.quality_traceability_links;

create policy qlcl_traceability_org_select
on public.quality_traceability_links
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.is_active = true
      and p.organization_id = quality_traceability_links.organization_id
  )
);
