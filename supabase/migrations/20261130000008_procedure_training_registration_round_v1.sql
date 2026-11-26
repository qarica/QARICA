-- "Mỗi đợt đào tạo có nhiều buổi/ngày khác nhau, cần đăng ký theo từng
-- buổi" — đăng ký (procedure_training_registrations) ban đầu chỉ gắn với
-- CẢ đợt đào tạo (training_id), không phân biệt buổi nào. Thêm round_id
-- (tùy chọn — đợt đào tạo chưa tạo "đợt kiểm tra" nào thì vẫn đăng ký được
-- bình thường, không ép buộc phải có buổi mới cho đăng ký). Tái dùng
-- procedure_training_rounds làm "buổi/đợt" để chọn lúc đăng ký — bảng này
-- vốn đã là nhãn tự do không giới hạn Pre/Post (vd có thể đặt tên "Buổi 1 -
-- 10/3/2027"), không cần thêm 1 khái niệm/bảng mới riêng cho "buổi học".
alter table public.procedure_training_registrations
  add column if not exists round_id uuid references public.procedure_training_rounds(id) on delete cascade;

create index if not exists procedure_training_registrations_round_idx
  on public.procedure_training_registrations(round_id);
