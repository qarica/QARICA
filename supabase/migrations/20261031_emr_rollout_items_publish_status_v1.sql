-- Báo cáo thực tế: "Danh mục biểu mẫu còn thiếu duyệt phát hành hoặc cập
-- nhật. Sau khi duyệt mới triển khai, áp dụng, tiến độ" — emr_rollout_items
-- (đặc biệt danh mục BIEU_MAU) chưa có bước duyệt nào trước khi 1 hạng mục
-- được tính vào tiến độ triển khai (status), gán phạm vi áp dụng
-- (department_ids), hay đếm vào KPI "Tiến độ triển khai". Thêm publish_status
-- (DRAFT/PUBLISHED) + published_at/published_by, theo đúng quy ước đặt tên
-- verified_at/verified_by đã dùng cho go-live gate (20260926_emr_program_
-- control_v1.sql) — không tạo bảng version riêng như checklist templates vì
-- đây chỉ là 1 cờ duyệt cho chính hạng mục, không cần giữ lịch sử nhiều
-- phiên bản nội dung.
--
-- Hạng mục MỚI mặc định DRAFT (default ở mức cột — route POST không set
-- publish_status tường minh, luôn rơi vào default này, không cho client tự ý
-- tạo thẳng PUBLISHED). Hạng mục ĐÃ CÓ SẴN trước migration này backfill
-- PUBLISHED để không đột ngột biến mất khỏi tiến độ/phạm vi áp dụng đang
-- dùng thật.
alter table public.emr_rollout_items
  add column if not exists publish_status text,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references auth.users(id);

update public.emr_rollout_items
  set publish_status = 'PUBLISHED', published_at = coalesce(published_at, created_at)
  where publish_status is null;

alter table public.emr_rollout_items
  alter column publish_status set default 'DRAFT';
alter table public.emr_rollout_items
  alter column publish_status set not null;

alter table public.emr_rollout_items
  drop constraint if exists emr_rollout_items_publish_status_check;
alter table public.emr_rollout_items
  add constraint emr_rollout_items_publish_status_check check (publish_status in ('DRAFT','PUBLISHED'));

create index if not exists emr_rollout_items_org_category_publish_idx
  on public.emr_rollout_items(organization_id, category, publish_status);
