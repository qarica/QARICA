-- Vai trò chuyên trách Kho hóa chất & VTYT xét nghiệm: chỉ có quyền của menu Kho
-- (lab_supplies.view + lab_supplies.manage), không có quyền ở bất kỳ menu nghiệp vụ nào khác.
-- Là dữ liệu cấu hình chung (master data); việc gán vai trò cho từng người làm qua /admin/users.
insert into public.roles (code, name, description, is_active)
select 'LAB_SUPPLIES_KEEPER', 'Thủ kho hóa chất & VTYT XN', 'Toàn quyền menu Kho hóa chất & VTYT xét nghiệm; không có quyền ở các menu khác.', true
where not exists (select 1 from public.roles where code = 'LAB_SUPPLIES_KEEPER');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('lab_supplies.view', 'lab_supplies.manage')
where r.code = 'LAB_SUPPLIES_KEEPER'
  and not exists (select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id);
