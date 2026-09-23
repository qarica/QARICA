-- Split work-calendar management policy so SELECT has only one permissive policy.
-- Authorization semantics remain the same for system.manage writes.
drop policy if exists work_calendar_holidays_manage_system on public.work_calendar_holidays;

create policy work_calendar_holidays_insert_system
on public.work_calendar_holidays
for insert to authenticated
with check (
  organization_id = (
    select p.organization_id from public.profiles p
    where p.user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id=ur.role_id
    join public.permissions pe on pe.id=rp.permission_id
    where ur.user_id=(select auth.uid())
      and pe.code='system.manage'
      and pe.is_active=true
  )
);

create policy work_calendar_holidays_update_system
on public.work_calendar_holidays
for update to authenticated
using (
  organization_id = (
    select p.organization_id from public.profiles p
    where p.user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id=ur.role_id
    join public.permissions pe on pe.id=rp.permission_id
    where ur.user_id=(select auth.uid())
      and pe.code='system.manage'
      and pe.is_active=true
  )
)
with check (
  organization_id = (
    select p.organization_id from public.profiles p
    where p.user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id=ur.role_id
    join public.permissions pe on pe.id=rp.permission_id
    where ur.user_id=(select auth.uid())
      and pe.code='system.manage'
      and pe.is_active=true
  )
);

create policy work_calendar_holidays_delete_system
on public.work_calendar_holidays
for delete to authenticated
using (
  organization_id = (
    select p.organization_id from public.profiles p
    where p.user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id=ur.role_id
    join public.permissions pe on pe.id=rp.permission_id
    where ur.user_id=(select auth.uid())
      and pe.code='system.manage'
      and pe.is_active=true
  )
);
