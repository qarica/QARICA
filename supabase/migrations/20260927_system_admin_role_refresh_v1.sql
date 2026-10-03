-- Re-assert full access for the "System Admin" role (SYSTEM_ADMIN) created in
-- 20260919_system_admin_role_v1.sql. That migration granted every permission active AT
-- THAT TIME as a one-off insert; permissions added since (evidence.view, emr.view,
-- emr.manage, safety_alert.*, departments.manage if it was created/re-created after that
-- date, ...) were never backfilled. Re-running the same idempotent grant catches up on
-- anything added since and self-heals if the original migration never reached this
-- environment. Insert-only, safe to re-run.

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'SYSTEM_ADMIN'
  and p.is_active
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission_id = p.id
  );

insert into public.user_roles (user_id, role_id)
select pr.user_id, r.id
from public.profiles pr
cross join public.roles r
where pr.email = 'qlcl01@qlcl-ttsg.com'
  and r.code = 'SYSTEM_ADMIN'
  and not exists (
    select 1 from public.user_roles ur
    where ur.user_id = pr.user_id and ur.role_id = r.id
  );
