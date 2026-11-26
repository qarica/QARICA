-- "Cần bổ sung chức năng quét QR hoặc link đăng ký để đăng ký slot trước...
-- vừa có thể kiểm soát ai đăng ký nhưng không đi học, ai không đăng ký theo
-- số lượng nhân viên của khoa phòng. Cần có ngưỡng chấm điểm đạt hay không
-- đạt... để yêu cầu học lại theo từng nhân viên." Quyết định đã chốt với
-- người dùng:
--   - Đăng ký: từng người tự quét QR đăng ký (không phải khoa/phòng khai số
--     lượng) — cùng mẫu với luồng tự làm bài qua QR đã có
--     (procedure_training_rounds.is_open_for_submission), nhưng đăng ký là
--     của CẢ ĐỢT ĐÀO TẠO (buổi học), không phải của 1 đợt kiểm tra cụ thể —
--     nên cột is_open_for_registration đặt ở procedure_trainings, không
--     phải procedure_training_rounds.
--   - Ngưỡng đạt/không đạt: 1 ngưỡng DUY NHẤT cho cả đợt đào tạo (không
--     tách riêng theo khoa/phòng) — pass_threshold ở procedure_trainings,
--     cùng thang điểm với test_score_max đã có.
--   - "Yêu cầu học lại": chỉ đánh dấu + liệt kê (không tự tạo đợt kiểm tra
--     "học lại" mới) — tính toán thuần ở tầng ứng dụng từ pass_threshold so
--     với điểm của đợt kiểm tra gần nhất mà người đó có điểm, KHÔNG lưu
--     thêm cột trạng thái đạt/không đạt (tránh 2 nguồn sự thật lệch nhau
--     nếu sau này sửa điểm hoặc đổi ngưỡng — CLAUDE.md nguyên tắc 2).
--   - Số nhân viên khoa/phòng (để biết "ai chưa đăng ký" so với tổng số
--     thật): thêm field dùng chung ở danh mục khoa/phòng (departments),
--     không nhập riêng lẻ từng đợt đào tạo — khai 1 lần, dùng lại mọi đợt
--     sau này, giống bed_count/floor_order đã làm.
alter table public.departments
  add column if not exists staff_count integer;
alter table public.departments
  drop constraint if exists departments_staff_count_check;
alter table public.departments
  add constraint departments_staff_count_check check (staff_count is null or staff_count >= 0);

alter table public.procedure_trainings
  add column if not exists pass_threshold numeric,
  add column if not exists is_open_for_registration boolean not null default false;
alter table public.procedure_trainings
  drop constraint if exists procedure_trainings_pass_threshold_check;
alter table public.procedure_trainings
  add constraint procedure_trainings_pass_threshold_check check (pass_threshold is null or pass_threshold >= 0);

-- Danh sách đăng ký slot trước khi đào tạo — KHÔNG phải attendee (attendee
-- là người ĐÃ tham gia/có điểm; registration là người BÁO TRƯỚC sẽ tham
-- gia). Cố ý không FK sang attendees vì đăng ký xảy ra TRƯỚC khi attendee
-- tồn tại — đối chiếu đăng ký-vs-có mặt làm ở tầng ứng dụng bằng so khớp
-- tên/mã NV đã chuẩn hoá (cùng cách matching đã dùng ở import file khảo
-- sát), không ép buộc 1-1 cứng ở DB.
create table if not exists public.procedure_training_registrations (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.procedure_trainings(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  employee_name text not null check (char_length(btrim(employee_name)) between 1 and 200),
  employee_code text,
  department text,
  job_title text,
  registered_at timestamptz not null default now()
);

create index if not exists procedure_training_registrations_training_idx
  on public.procedure_training_registrations(training_id);

alter table public.procedure_training_registrations enable row level security;

-- Route công khai (/api/public/training-registration/**) dùng service-role
-- (createAdminClient), KHÔNG thêm policy cho role anon — giống hệt
-- procedure_training_self_test_v1 (xem comment ở đó).
drop policy if exists qlcl_authenticated_select on public.procedure_training_registrations;
create policy qlcl_authenticated_select on public.procedure_training_registrations
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));
