-- =========================================================================
-- Đưa vào version control lần đầu tiên: has_permission và
-- can_create_record_type — hai hàm quyết định toàn bộ phân quyền của hệ
-- thống (ai được thao tác gì, ai được tạo loại hồ sơ nào).
--
-- Trước migration này, 2 hàm chỉ tồn tại "sống" trên Supabase production,
-- không có trong GitHub — không có lịch sử, không review được, không thể
-- khôi phục nếu mất. Nội dung dưới đây lấy nguyên văn từ production bằng
-- pg_get_functiondef() ngày 2026-09-16, dùng CREATE OR REPLACE nên chạy
-- lại không thay đổi hành vi hiện tại — chỉ để đồng bộ git với thực tế.
--
-- QUAN TRỌNG: cả 2 hàm dùng auth.uid() bên trong, nên PHẢI luôn được gọi
-- bằng Supabase client mang theo JWT của người dùng đăng nhập (client
-- `supabase` từ @/lib/supabase/server, KHÔNG phải client `admin` dùng
-- service role) — đúng nguyên nhân gây lỗi của next_record_code đã sửa
-- trong migration 20260916_fix_next_record_code_org_param.sql. Toàn bộ
-- code hiện tại (src/lib/api-auth.ts, domain-records/route.ts) đã gọi
-- đúng cách; migration này chỉ ghi lại, không đổi cách gọi.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.can_create_record_type(p_record_type text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_permission text;
begin
  v_permission := case upper(coalesce(p_record_type,''))
    when 'DIRECTIVE' then 'directives.manage'
    when 'REPORT' then 'reports.manage'
    when 'INSPECTION' then 'inspections.manage'
    when 'INDICATOR_MEASUREMENT' then 'indicators.enter'
    when 'FINDING' then 'findings.manage'
    when 'INCIDENT' then 'incident.report'
    when 'CAPA' then 'capa.manage'
    when 'RISK' then 'risk.manage'
    when 'FMEA' then 'risk.manage'
    when 'IMPROVEMENT_PROPOSAL' then 'projects.propose'
    when 'IMPROVEMENT_PROJECT' then 'projects.manage'
    when 'ASSESSMENT' then 'criteria.assess'
    when 'EXTERNAL_ASSESSMENT' then 'criteria.manage'
    when 'AUDIT' then 'audit.manage'
    when 'SAFETY_ALERT' then 'incident.triage'
    when 'FEEDBACK' then 'feedback.manage'
    when 'PROGRAM' then 'plans.manage'
    else null
  end;
  if v_permission is null then return false; end if;
  return public.has_permission(v_permission);
end;
$function$;

CREATE OR REPLACE FUNCTION public.has_permission(p_permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with role_grants as (
    select p.code
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id=ur.role_id
    join public.permissions p on p.id=rp.permission_id and p.is_active
    where ur.user_id=auth.uid()
  ),
  overrides as (
    select p.code, up.is_allowed
    from public.user_permissions up
    join public.permissions p on p.id=up.permission_id and p.is_active
    where up.user_id=auth.uid()
  )
  select case
    when exists(select 1 from overrides where code=p_permission_code and is_allowed=false) then false
    when exists(select 1 from overrides where code=p_permission_code and is_allowed=true) then true
    when exists(select 1 from role_grants where code=p_permission_code) then true
    else false
  end
$function$;

COMMENT ON FUNCTION public.can_create_record_type(text) IS
  'Ánh xạ loại hồ sơ (record_type) sang mã quyền tương ứng rồi kiểm tra qua has_permission(). Phải gọi bằng client mang JWT người dùng, không gọi bằng service role.';

COMMENT ON FUNCTION public.has_permission(text) IS
  'Kiểm tra người dùng hiện tại (auth.uid()) có quyền p_permission_code không, ưu tiên override cá nhân (user_permissions) trước, sau đó mới xét theo vai trò (role_permissions). Phải gọi bằng client mang JWT người dùng, không gọi bằng service role.';
