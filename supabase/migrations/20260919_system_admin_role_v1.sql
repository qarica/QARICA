-- Ensure a true full-access "System Admin" role exists, grant it every currently active
-- permission, and assign it to qlcl01@qlcl-ttsg.com - avoids chasing individual missing
-- permissions (departments.manage, permissions.manage, system.manage, ...) one at a time.

insert into public.roles (code, name, description, is_active)
select 'SYSTEM_ADMIN', 'Quản trị viên hệ thống',
       'Toàn quyền quản trị: người dùng, khoa/phòng, phân quyền, danh mục và cấu hình hệ thống.', true
where not exists (select 1 from public.roles where code = 'SYSTEM_ADMIN');

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
