-- Multi-tenant read boundary, batch 6: RBAC assignments and audit log.
-- Global role/permission definitions are intentionally left as shared reference data;
-- user-specific assignments and logs are tenant-scoped.

-- Remove both the legacy permissive policy name and the newer standard name.
drop policy if exists department_user_roles_authenticated_select on public.department_user_roles;
drop policy if exists qlcl_authenticated_select on public.department_user_roles;
create policy qlcl_authenticated_select
on public.department_user_roles for select to authenticated
using (organization_id = private.current_organization_id());

drop policy if exists qlcl_authenticated_select on public.user_roles;
create policy qlcl_authenticated_select
on public.user_roles for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = user_roles.user_id
      and p.organization_id = private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.user_permissions;
create policy qlcl_authenticated_select
on public.user_permissions for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = user_permissions.user_id
      and p.organization_id = private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.user_scopes;
create policy qlcl_authenticated_select
on public.user_scopes for select to authenticated
using (
  exists (
    select 1
    from public.profiles p
    join public.departments d on d.id = user_scopes.department_id
    where p.user_id = user_scopes.user_id
      and p.organization_id = private.current_organization_id()
      and d.organization_id = private.current_organization_id()
  )
);

-- Audit rows linked to a record inherit record ownership. System/non-record audit rows
-- are visible only when their actor belongs to the current organization.
drop policy if exists qlcl_authenticated_select on public.audit_logs;
create policy qlcl_authenticated_select
on public.audit_logs for select to authenticated
using (
  (record_id is not null and private.record_in_current_organization(record_id))
  or
  (
    record_id is null
    and actor_user_id is not null
    and exists (
      select 1 from public.profiles p
      where p.user_id = audit_logs.actor_user_id
        and p.organization_id = private.current_organization_id()
    )
  )
);

revoke select on
  public.department_user_roles,
  public.user_roles,
  public.user_permissions,
  public.user_scopes,
  public.audit_logs
from anon;
