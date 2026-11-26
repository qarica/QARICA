-- Hai nhu cầu thực tế ở Quản lý đào tạo:
--   1) "chưa có chức năng trộn thứ tự câu hỏi" — mỗi người làm bài qua QR thấy
--      thứ tự câu hỏi khác nhau, hạn chế chép bài. Bật/tắt theo TỪNG đợt kiểm
--      tra (procedure_training_rounds), mặc định TẮT để không đổi hành vi các
--      đợt đang chạy.
--   2) "chưa có chức năng tập huấn chỉ quét QR điểm danh, chưa cần làm test" —
--      lớp tập huấn không có bài kiểm tra: nhân viên chỉ quét QR để điểm danh.
--      is_attendance_only đánh dấu lớp ở chế độ "chỉ điểm danh" (ẩn phần bài
--      test); is_open_for_attendance bật/tắt thủ công link/QR điểm danh (mặc
--      định đóng, cùng nguyên tắc an toàn với is_open_for_registration /
--      is_open_for_submission); checked_in_at ghi thời điểm quét QR thật (null
--      với người điểm danh thủ công/nhập file). Điểm danh vẫn là
--      attended/attended_at có sẵn — KHÔNG tạo bảng điểm danh thứ hai (một
--      nghiệp vụ chỉ một nguồn sự thật).
-- Chỉ THÊM cột có mặc định, không đụng dữ liệu cũ.
alter table public.procedure_training_rounds
  add column if not exists shuffle_questions boolean not null default false;

alter table public.procedure_trainings
  add column if not exists is_attendance_only boolean not null default false,
  add column if not exists is_open_for_attendance boolean not null default false;

alter table public.procedure_training_attendees
  add column if not exists checked_in_at timestamptz;
