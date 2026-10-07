-- Tách quyền duyệt 2 cấp BGĐ/TGĐ cho Đề xuất mua sắm/sửa chữa. Trước đây cả
-- 4 action (BGD_APPROVE, BGD_REJECT, TGD_APPROVE, TGD_REJECT) đều chỉ cần
-- MỘT quyền duy nhất procurement.manage — bất kỳ ai có quyền này đều duyệt
-- được cả 2 cấp, xóa hết ý nghĩa của quy trình 2 cấp BGĐ -> TGĐ.
--
-- Backfill: mọi role đang có procurement.manage được cấp CẢ 2 quyền mới để
-- không ai bị mất quyền đang dùng ngay khi chạy migration — việc tách người
-- phụ trách từng cấp (BGĐ khác TGĐ) là việc Admin tự làm sau ở
-- /admin/users bằng cách rút bớt 1 trong 2 quyền cho từng tài khoản.
insert into public.permissions(code,name,description,module,is_active) values
('procurement.approve_bgd','Duyệt mua sắm cấp BGĐ','Phê duyệt/từ chối đề xuất mua sắm ở cấp Ban Giám đốc.','procurement',true),
('procurement.approve_tgd','Duyệt mua sắm cấp TGĐ','Phê duyệt/từ chối đề xuất mua sắm ở cấp Tổng Giám đốc.','procurement',true)
on conflict(code) do update set name=excluded.name,description=excluded.description,module=excluded.module,is_active=true;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='procurement.manage'
join public.permissions p_new on p_new.code='procurement.approve_bgd'
on conflict(role_id,permission_id) do nothing;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='procurement.manage'
join public.permissions p_new on p_new.code='procurement.approve_tgd'
on conflict(role_id,permission_id) do nothing;
