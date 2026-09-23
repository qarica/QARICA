-- Multi-tenant read boundary, batch 1.
-- KH50 or any other annual plan is data; tenant isolation belongs to QARICA core.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select p.organization_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.is_active
  limit 1
$function$;

revoke all on function private.current_organization_id() from public, anon;
grant execute on function private.current_organization_id() to authenticated, service_role;

-- Core tenant-owned tables.
drop policy if exists qlcl_authenticated_select on public.records;
create policy qlcl_authenticated_select
on public.records for select to authenticated
using (organization_id = private.current_organization_id());

drop policy if exists qlcl_authenticated_select on public.profiles;
create policy qlcl_authenticated_select
on public.profiles for select to authenticated
using (organization_id = private.current_organization_id());

drop policy if exists qlcl_authenticated_select on public.departments;
create policy qlcl_authenticated_select
on public.departments for select to authenticated
using (organization_id = private.current_organization_id());

drop policy if exists qlcl_authenticated_select on public.organizations;
create policy qlcl_authenticated_select
on public.organizations for select to authenticated
using (id = private.current_organization_id());

-- Record-backed operational tables inherit the tenant boundary from records.
drop policy if exists qlcl_authenticated_select on public.actions;
create policy qlcl_authenticated_select
on public.actions for select to authenticated
using (
  exists (
    select 1
    from public.records r
    where r.id = actions.record_id
      and r.organization_id = private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.work_programs;
create policy qlcl_authenticated_select
on public.work_programs for select to authenticated
using (
  exists (
    select 1
    from public.records r
    where r.id = work_programs.record_id
      and r.organization_id = private.current_organization_id()
  )
);

drop policy if exists qlcl_authenticated_select on public.program_action_links;
create policy qlcl_authenticated_select
on public.program_action_links for select to authenticated
using (
  exists (
    select 1
    from public.work_programs wp
    join public.records r on r.id = wp.record_id
    where wp.id = program_action_links.program_id
      and r.organization_id = private.current_organization_id()
  )
);

-- Views must respect caller RLS instead of the view owner's privileges.
alter view public.vw_actions_dashboard set (security_invoker = true);
alter view public.vw_program_progress set (security_invoker = true);

-- Anonymous users never need direct quality-management data.
revoke select on public.records,
  public.profiles,
  public.departments,
  public.organizations,
  public.actions,
  public.work_programs,
  public.program_action_links,
  public.vw_actions_dashboard,
  public.vw_program_progress
from anon;
