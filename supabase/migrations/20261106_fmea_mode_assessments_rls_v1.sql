-- fmea_mode_assessments (điểm S/O/D/RPN theo từng failure mode — baseline và
-- residual sau can thiệp) chưa từng được enable row level security, và
-- không nằm trong danh sách revoke select from anon ở
-- 20260923075000_tenant_read_boundary_workflow_links_v1.sql dù 2 bảng cha
-- trực tiếp cùng lô (fmea_process_steps, fmea_failure_modes) đã được xử lý
-- đúng ở đó. Toàn bộ code trong app chỉ đọc/ghi bảng này qua admin client
-- (service-role, luôn bỏ qua RLS) — xem src/app/api/fmea/[id]/assessments/
-- route.ts — nên bật RLS ở đây không ảnh hưởng gì đến hoạt động của app,
-- chỉ đóng lỗ hổng: nếu RLS thực sự đang tắt trên DB sống, bất kỳ user đã
-- đăng nhập (của BẤT KỲ bệnh viện nào dùng chung QARICA) có thể gọi trực
-- tiếp Supabase REST API bằng JWT của chính họ để đọc/ghi điểm S/O/D/RPN
-- của MỌI tổ chức khác — dữ liệu đánh giá rủi ro an toàn người bệnh.
--
-- Cùng chuỗi join đã dùng cho fmea_failure_modes ở migration trên:
-- fmea_mode_assessments -> fmea_failure_modes -> fmea_process_steps ->
-- fmea_studies -> records.organization_id.
alter table public.fmea_mode_assessments enable row level security;

drop policy if exists qlcl_authenticated_select on public.fmea_mode_assessments;
create policy qlcl_authenticated_select on public.fmea_mode_assessments for select to authenticated
using (
  exists (
    select 1
    from public.fmea_failure_modes fm
    join public.fmea_process_steps ps on ps.id = fm.process_step_id
    join public.fmea_studies fs on fs.id = ps.fmea_study_id
    join public.records r on r.id = fs.record_id
    where fm.id = fmea_mode_assessments.failure_mode_id
      and r.organization_id = private.current_organization_id()
  )
);

revoke select on public.fmea_mode_assessments from anon;
