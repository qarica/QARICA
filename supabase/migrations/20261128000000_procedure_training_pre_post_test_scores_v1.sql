-- "A muốn cập nhật vào quản lý đào tạo" — báo cáo đào tạo thực tế (Pre-test/
-- Post-test đánh giá hiệu quả đào tạo quy trình) có điểm theo từng người,
-- nhưng procedure_training_attendees trước đây chỉ có attended (có/vắng),
-- không có chỗ lưu điểm. Thang điểm bài test là thuộc tính của CẢ đợt đào
-- tạo (mọi người cùng làm 1 bài), nên đặt ở procedure_trainings; điểm Pre/
-- Post là thuộc tính của từng người, đặt ở procedure_training_attendees.
-- Không bắt buộc (null) vì không phải đợt đào tạo nào cũng có bài test
-- trước/sau — vẫn dùng được đúng như cũ cho các đợt chỉ điểm danh.
alter table public.procedure_trainings
  add column if not exists test_score_max numeric check (test_score_max is null or test_score_max > 0);

alter table public.procedure_training_attendees
  add column if not exists pre_test_score numeric check (pre_test_score is null or pre_test_score >= 0),
  add column if not exists post_test_score numeric check (post_test_score is null or post_test_score >= 0);
