-- Kho hóa chất & VTYT XN: hiện chỉ quản trị viên được xem/quản lý (theo yêu cầu: chỉ admin và tài khoản QLCL phụ trách,
-- đều mang vai trò SYSTEM_ADMIN). Cấu hình theo VAI TRÒ, không gắn cứng tài khoản/email nào (CLAUDE.md nguyên tắc 1):
-- gỡ quyền lab_supplies.view / lab_supplies.manage khỏi mọi vai trò trừ ADMIN và SYSTEM_ADMIN. Sau này muốn mở thêm,
-- cấp lại quyền cho vai trò tương ứng ở màn hình phân quyền. Chạy lại nhiều lần an toàn (xóa đã xóa thì thôi).
delete from public.role_permissions rp
using public.permissions p, public.roles r
where rp.permission_id = p.id
  and rp.role_id = r.id
  and p.code in ('lab_supplies.view', 'lab_supplies.manage')
  and r.code not in ('ADMIN', 'SYSTEM_ADMIN');
