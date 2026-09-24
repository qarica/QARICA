-- QARICA generic Evidence view permission V1.
-- Preserve current effective access by copying tasks.view role mappings.
insert into public.permissions(code,name,description,module,is_active)
values (
  'evidence.view',
  'Xem minh chứng',
  'Xem hoặc tải minh chứng thuộc phạm vi tổ chức và hồ sơ được phép truy cập.',
  'evidence',
  true
)
on conflict(code) do update
set name=excluded.name,
    description=excluded.description,
    module=excluded.module,
    is_active=true;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id
from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='tasks.view'
join public.permissions p_new on p_new.code='evidence.view'
on conflict(role_id,permission_id) do nothing;
