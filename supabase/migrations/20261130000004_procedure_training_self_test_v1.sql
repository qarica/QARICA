-- "Thiết kế làm bài test trên qarica luôn. Nhân viên có thể quét QR để vào
-- trực tiếp làm bài mà ko cần đăng nhập." Cho phép 1 đợt kiểm tra
-- (procedure_training_rounds) mở cho nhân viên tự làm bài qua link/QR công
-- khai, không cần tài khoản QARICA (nhiều người được đào tạo không có tài
-- khoản trong hệ thống). Quyết định đã chốt với người dùng:
--   - Xác thực: tự nhập Họ tên + mã NV (không yêu cầu có sẵn trong danh
--     sách đăng ký) — vẫn tạo attendee như luồng nhập tay/import hiện có.
--   - Bộ câu hỏi: dùng chung theo training_id cho mọi đợt (không tách theo
--     round) — giữ đúng procedure_training_questions hiện có, chỉ bổ sung
--     nội dung câu hỏi để render công khai, KHÔNG đổi khoá chính/tham chiếu.
--   - Làm lại: không cho phép — khoá bằng unique(round_id, attendee_id) đã
--     có sẵn ở procedure_training_results, cộng kiểm tra tìm attendee trùng
--     mã NV đã nộp bài ở API (xem src/lib/training-self-test.ts).
--   - Hiệu lực QR: do QLCL bật/tắt thủ công theo từng đợt — cột
--     is_open_for_submission dưới đây, mặc định false (an toàn, QR chỉ chạy
--     khi được chủ động mở).
-- Route công khai (/api/public/training-test/**) dùng service-role
-- (createAdminClient, như mọi route admin khác trong app) — KHÔNG thêm
-- policy RLS cho role anon, vì service role đã bỏ qua RLS hoàn toàn và toàn
-- bộ việc kiểm tra tenant/trạng thái mở nằm ở code API, không phải ở DB.
alter table public.procedure_training_rounds
  add column if not exists is_open_for_submission boolean not null default false;

-- Nội dung câu hỏi để hiển thị công khai — KHÔNG BAO GIỜ trả correct_answer
-- về cho route công khai (xem GET /api/public/training-test/[roundId]).
-- choices là mảng text (jsonb); để trống/null = câu hỏi tự luận (nhập chữ).
alter table public.procedure_training_questions
  add column if not exists question_text text,
  add column if not exists choices jsonb;
