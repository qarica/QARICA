-- Audit giao diện QARICA (ưu tiên #2): 3 bảng dùng ở Dashboard/Sự cố/Cảnh
-- báo an toàn/Cải tiến chất lượng có RLS BẬT nhưng KHÔNG CÓ POLICY SELECT
-- nào (xác nhận bằng pg_policy trên Supabase sống — không suy ra từ code).
-- Đây là nguyên nhân thật khiến các trang này phải dùng createAdminClient()
-- (service role, bỏ qua RLS) ngay cả cho thao tác chỉ đọc — không phải cố ý
-- né RLS. Thêm policy SELECT theo đúng mẫu đã dùng cho mọi bảng khác trong
-- hệ thống (qlcl_authenticated_select, scope theo organization qua
-- private.current_organization_id() / private.record_in_current_organization()),
-- để các route này đổi được sang createClient() (tôn trọng RLS theo quyền
-- user thật) mà không làm vỡ chức năng (trả về rỗng).

create policy qlcl_authenticated_select on public.quality_domains
  for select to authenticated
  using (organization_id = private.current_organization_id());

create policy qlcl_authenticated_select on public.record_quality_domain_links
  for select to authenticated
  using (private.record_in_current_organization(record_id));

-- incident_lessons_learned không có organization_id/record_id trực tiếp —
-- chỉ có incident_id. KHÔNG join trực tiếp vào bảng incidents trong USING
-- clause (sẽ bị áp RLS của chính incidents: incident_select_authorized đòi
-- has_permission('incident.view_case') — nhưng trang /safety-alerts chỉ
-- đòi safety_alert.view, một quyền khác hẳn; join trực tiếp sẽ làm user có
-- safety_alert.view nhưng không có incident.view_case không thấy được bài
-- học đã công bố, dù đây đúng là nhóm người dùng mục tiêu của "lessons
-- learned" công khai/ẩn danh). Thay vào đó dùng hàm SECURITY DEFINER riêng,
-- bỏ qua RLS của incidents, chỉ kiểm tra đúng phạm vi tổ chức — khớp quyền
-- kiểm tra ở tầng ứng dụng (page.tsx) thay vì RLS của bảng incidents.
create function private.incident_in_current_organization(p_incident_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.incidents i
    where i.id = p_incident_id
      and private.record_in_current_organization(i.record_id)
  )
$$;

create policy qlcl_authenticated_select on public.incident_lessons_learned
  for select to authenticated
  using (private.incident_in_current_organization(incident_id));
