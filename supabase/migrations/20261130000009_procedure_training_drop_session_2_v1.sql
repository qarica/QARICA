-- Báo cáo thực tế: "Xoá đào tạo lần 2" — model "1 lớp có đào tạo lần 1/lần
-- 2" trong procedure_trainings đã bị thay bằng model "1 chủ đề có nhiều
-- lớp" (xem "+ Tạo lớp mới cùng chủ đề" — procedure-training-class-code.ts
-- / topicKeyFor ở procedure-training-topic-rollup.ts): cần đào tạo lại thì
-- tạo 1 LỚP MỚI cùng chủ đề (kế thừa thông tin, có mã lớp .N riêng), không
-- còn điền "đợt 2" vào cùng 1 lớp nữa. Xác nhận trực tiếp trên Supabase
-- sống trước khi xoá (CLAUDE.md nguyên tắc 6): không có dòng nào của
-- procedure_trainings có dữ liệu ở session_2_time/location/method — an
-- toàn để xoá hẳn cột, tránh để lại trường chết không ai dùng (CLAUDE.md
-- nguyên tắc 2: một nghiệp vụ chỉ có một nguồn sự thật).
alter table public.procedure_trainings drop column if exists session_2_time;
alter table public.procedure_trainings drop column if exists session_2_location;
alter table public.procedure_trainings drop column if exists session_2_method;
