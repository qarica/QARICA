-- QARICA Safety Alert permission separation V1.
-- Preserve current effective access by copying existing Incident role mappings,
-- while allowing future administration to separate incident handling from alert publication.

insert into public.permissions(code,name,description,module,is_active)
values
  ('safety_alert.view','Xem cảnh báo an toàn','Xem hồ sơ và nội dung cảnh báo an toàn.','safety_alert',true),
  ('safety_alert.edit','Soạn cảnh báo an toàn','Soạn/chỉnh sửa và gửi rà soát cảnh báo an toàn.','safety_alert',true),
  ('safety_alert.publish','Phê duyệt/phát hành cảnh báo an toàn','Trả lại, phát hành và lưu hết hiệu lực cảnh báo an toàn.','safety_alert',true)
on conflict(code) do update
set name=excluded.name,
    description=excluded.description,
    module=excluded.module,
    is_active=true;

-- Keep existing view audience: anyone who could view incident case/summary can view safety alerts.
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id
from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id
join public.permissions p_new on p_new.code='safety_alert.view'
where p_old.code in ('incident.view_summary','incident.view_case')
on conflict(role_id,permission_id) do nothing;

-- Keep existing editor audience: incident investigators continue to edit alerts after migration.
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id
from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id
join public.permissions p_new on p_new.code='safety_alert.edit'
where p_old.code='incident.investigate'
on conflict(role_id,permission_id) do nothing;

-- Keep existing publisher audience: incident closers continue to publish/archive alerts after migration.
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id
from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id
join public.permissions p_new on p_new.code='safety_alert.publish'
where p_old.code='incident.close'
on conflict(role_id,permission_id) do nothing;
