-- Tighten the existing EMR org-scoped SELECT policy without changing rows.
-- The authenticated work view must never grant cross-module access.
alter policy qlcl_authenticated_select on public.emr_rollout_items
using (
  organization_id = (select private.current_organization_id())
  and ((select public.has_permission('emr.view')) or (select public.has_permission('emr.manage')))
);
