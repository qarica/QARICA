-- Cách ly dữ liệu cho tài khoản CHỈ có quyền Kho hóa chất & VTYT XN (vd. vai trò LAB_SUPPLIES_KEEPER).
--
-- Vấn đề: chính sách RLS của hầu hết các bảng chỉ kiểm tra "cùng bệnh viện", không kiểm tra quyền chức năng; việc chặn theo
-- quyền nằm ở tầng trang/API của ứng dụng. Vì vậy một tài khoản chỉ có menu Kho vẫn đọc được dữ liệu các module khác nếu gọi
-- thẳng API Supabase bằng token của mình (đo thực tế: 1.512 nhật ký, 45 hồ sơ, 166 hạng mục EMR, 41 hồ sơ nhân sự...).
--
-- Giải pháp: chính sách RESTRICTIVE (AND với chính sách sẵn có) chặn mọi thao tác với người dùng "chỉ có quyền Kho".
-- Người dùng có bất kỳ quyền nào khác không bị ảnh hưởng (hàm trả false).
-- Ngoại lệ: bảng Kho, bảng tham chiếu dùng chung, dữ liệu cá nhân của chính người dùng; bảng danh tính chỉ cho đọc dòng của mình.
-- LƯU Ý khi thêm bảng mới ở các migration sau: bảng mới KHÔNG tự có chính sách này; chạy lại
-- select public.qlcl_apply_kho_only_isolation_v1(); (idempotent) sau khi tạo bảng.

create or replace function public.qlcl_is_kho_only()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with role_grants as (
    select p.code from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id and p.is_active
    where ur.user_id = auth.uid()
  ), overrides as (
    select p.code, up.is_allowed from public.user_permissions up
    join public.permissions p on p.id = up.permission_id and p.is_active
    where up.user_id = auth.uid()
  ), effective as (
    select code from role_grants where code not in (select code from overrides where not is_allowed)
    union
    select code from overrides where is_allowed
  )
  select exists (select 1 from effective where code like 'lab\_supplies.%')
     and not exists (select 1 from effective where code not like 'lab\_supplies.%');
$$;

revoke all on function public.qlcl_is_kho_only() from public, anon;
grant execute on function public.qlcl_is_kho_only() to authenticated, service_role;

create or replace function public.qlcl_apply_kho_only_isolation_v1()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  n integer := 0;
  -- Bảng không chặn: Kho, tham chiếu dùng chung, dữ liệu cá nhân của chính người dùng.
  allow_tables constant text[] := array[
    'organizations', 'departments', 'permissions', 'roles', 'role_permissions', 'role_aliases',
    'record_types', 'quality_domains', 'work_calendar_holidays',
    'notifications', 'notification_deliveries', 'personal_reminders', 'personal_workspace_items', 'sidebar_pinned_items'
  ];
  -- Bảng danh tính: người dùng chỉ-Kho chỉ thấy/sửa dòng của chính mình.
  own_tables constant text[] := array['profiles', 'user_roles', 'user_permissions', 'user_scopes', 'department_user_roles'];
begin
  for t in
    select c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
      and c.relname not like 'lab\_supply\_%'
      and c.relname <> all (allow_tables)
  loop
    execute format('drop policy if exists qlcl_kho_only_block on public.%I', t.relname);
    if t.relname = any (own_tables) then
      execute format('create policy qlcl_kho_only_block on public.%I as restrictive for all to authenticated using ((select not public.qlcl_is_kho_only()) or user_id = (select auth.uid())) with check ((select not public.qlcl_is_kho_only()) or user_id = (select auth.uid()))', t.relname);
    else
      execute format('create policy qlcl_kho_only_block on public.%I as restrictive for all to authenticated using ((select not public.qlcl_is_kho_only())) with check ((select not public.qlcl_is_kho_only()))', t.relname);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.qlcl_apply_kho_only_isolation_v1() from public, anon, authenticated;
grant execute on function public.qlcl_apply_kho_only_isolation_v1() to service_role;

select public.qlcl_apply_kho_only_isolation_v1();
