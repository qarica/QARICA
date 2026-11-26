-- "chưa có phân tích kết quả theo đối tượng" — đơn vị/chức danh trước đây
-- gộp vào notes dạng text tự do ("Đơn vị: X · Chức danh: Y"), không thể
-- group by để phân tích. Tách thành cột riêng, có cấu trúc, dùng được cho
-- mọi đợt đào tạo (không hardcode riêng 1 đợt).
alter table public.procedure_training_attendees
  add column if not exists department text,
  add column if not exists job_title text;

-- Backfill dữ liệu thật đã nhập (báo cáo ATPT-HSBA) từ notes sang 2 cột mới.
update public.procedure_training_attendees
set
  department = nullif(btrim(substring(notes from 'Đơn vị: ([^·]+)')), ''),
  job_title = nullif(btrim(substring(notes from 'Chức danh: ([^·]+)')), '')
where notes ~ 'Đơn vị:|Chức danh:';
