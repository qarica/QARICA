-- Fix thật khẩn (phát hiện từ ảnh chụp production thật của người dùng):
-- banner đỏ "permission denied for table quality_domains" trên
-- /improvement/projects. Xác nhận trực tiếp trên Supabase sống (không suy
-- ra từ migration trong repo): "permission denied" là lỗi THIẾU GRANT cấp
-- bảng, khác hẳn RLS trả về 0 dòng — Postgres từ chối truy vấn trước khi
-- RLS kịp đánh giá nếu role chưa có GRANT cơ bản trên bảng.
--
-- Nguồn gốc: migration gốc 20260917_shared_quality_domains_v1.sql tạo 2
-- bảng quality_domains/record_quality_domain_links với
-- `revoke all ... from public, anon, authenticated` (chủ đích service-role-
-- only lúc đó). Sau này migration 20261112000000 thêm policy SELECT cho cả
-- 3 bảng (quality_domains, record_quality_domain_links,
-- incident_lessons_learned) để các route đổi từ createAdminClient() sang
-- createClient() tôn trọng RLS — nhưng CHỈ thêm policy, quên khôi phục lại
-- GRANT SELECT cấp bảng cho authenticated. Xác nhận trên Supabase sống: cả
-- 3 bảng đều có policy SELECT đúng nhưng information_schema.role_table_grants
-- không có dòng nào cho authenticated/anon — policy tồn tại nhưng vô dụng.
--
-- incident_lessons_learned: migration tạo bảng gốc (20260917) cũng
-- `revoke all ... from public, anon, authenticated` + chỉ grant cho
-- service_role — y hệt 2 bảng kia, cùng lỗi thiếu GRANT SELECT lại cho
-- authenticated sau khi có policy SELECT ở 20261112000000.

grant select on table public.quality_domains to authenticated;
grant select on table public.record_quality_domain_links to authenticated;
grant select on table public.incident_lessons_learned to authenticated;
