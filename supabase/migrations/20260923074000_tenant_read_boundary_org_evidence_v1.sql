-- Multi-tenant read boundary, batch 3: direct organization ownership and Evidence.
-- Nullable organization_id on master-data tables means a global reusable definition.

drop policy if exists qlcl_authenticated_select on public.department_user_roles;
create policy qlcl_authenticated_select
on public.department_user_roles for select to authenticated
using (organization_id = private.current_organization_id());

drop policy if exists qlcl_authenticated_select on public.evidence;
create policy qlcl_authenticated_select
on public.evidence for select to authenticated
using (organization_id = private.current_organization_id());

drop policy if exists qlcl_authenticated_select on public.recurring_work_templates;
create policy qlcl_authenticated_select
on public.recurring_work_templates for select to authenticated
using (organization_id = private.current_organization_id());

drop policy if exists qlcl_authenticated_select on public.checklist_templates;
create policy qlcl_authenticated_select
on public.checklist_templates for select to authenticated
using (organization_id is null or organization_id = private.current_organization_id());

drop policy if exists qlcl_authenticated_select on public.criteria_sets;
create policy qlcl_authenticated_select
on public.criteria_sets for select to authenticated
using (organization_id is null or organization_id = private.current_organization_id());

drop policy if exists qlcl_authenticated_select on public.indicator_definitions;
create policy qlcl_authenticated_select
on public.indicator_definitions for select to authenticated
using (organization_id is null or organization_id = private.current_organization_id());

-- Evidence links may point to a record, department execution, or another supported
-- context, so tenant ownership is derived from the immutable Evidence owner.
drop policy if exists qlcl_authenticated_select on public.evidence_links;
create policy qlcl_authenticated_select
on public.evidence_links for select to authenticated
using (
  exists (
    select 1
    from public.evidence e
    where e.id = evidence_links.evidence_id
      and e.organization_id = private.current_organization_id()
  )
);

revoke select on
  public.department_user_roles,
  public.evidence,
  public.recurring_work_templates,
  public.checklist_templates,
  public.criteria_sets,
  public.indicator_definitions,
  public.evidence_links
from anon;
