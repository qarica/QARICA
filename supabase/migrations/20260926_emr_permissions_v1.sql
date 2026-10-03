-- QARICA EMR granular permissions. Preserve current access while separating view/manage.
insert into public.permissions(code,name,description,module,is_active) values
('emr.view','Xem EMR','Xem EMR Command Center và dữ liệu triển khai EMR trong phạm vi tổ chức.','emr',true),
('emr.manage','Quản lý EMR','Tạo, cập nhật, xác minh và đóng các hạng mục triển khai EMR trong phạm vi tổ chức.','emr',true)
on conflict(code) do update set name=excluded.name,description=excluded.description,module=excluded.module,is_active=true;

-- View follows the established tasks.view audience.
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='tasks.view'
join public.permissions p_new on p_new.code='emr.view'
on conflict(role_id,permission_id) do nothing;

-- Manage follows plan managers; administrators can later tailor mappings in RBAC.
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='plans.manage'
join public.permissions p_new on p_new.code='emr.manage'
on conflict(role_id,permission_id) do nothing;
