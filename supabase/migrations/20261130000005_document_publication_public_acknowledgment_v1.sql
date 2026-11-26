-- "Khi ban hành 1 quy trình mình sẽ gửi email ban hành toàn viện. Qarica sẽ
-- cấp 1 đường link để dán vào email để các nhân viên điền thông tin và xác
-- nhận đọc hiểu. Ko xác nhận trực tiếp trong qarica ko cần đăng nhập" —
-- nhiều người nhận email ban hành toàn viện không có tài khoản QARICA, nên
-- cần 1 đường xác nhận KHÔNG đăng nhập song song với nút "Tôi đã đọc và
-- hiểu" trong app hiện có (vẫn giữ nguyên cho người đã đăng nhập sẵn).
--
-- document_publication_acknowledgments trước đây bắt buộc user_id (danh
-- tính lấy từ auth.uid()) — nới ra cho phép xác nhận ẩn danh bằng Họ tên +
-- mã NV tự nhập, giống hệt quy ước đã dùng ở procedure_training_attendees/
-- route công khai /api/public/training-test/**. Không tách bảng riêng
-- (CLAUDE.md nguyên tắc 2: một nghiệp vụ "đã xác nhận đọc hiểu" chỉ 1 nguồn
-- sự thật) — 1 hàng chỉ cần 1 trong 2 cách định danh.
alter table public.document_publication_acknowledgments
  alter column user_id drop not null;

alter table public.document_publication_acknowledgments
  add column if not exists employee_name text,
  add column if not exists employee_code text;

alter table public.document_publication_acknowledgments
  drop constraint if exists document_publication_acknowledgments_identity_check;
alter table public.document_publication_acknowledgments
  add constraint document_publication_acknowledgments_identity_check
  check (user_id is not null or (employee_name is not null and employee_code is not null));

-- unique(document_publication_id, user_id) cũ không chặn trùng lặp xác nhận
-- ẩn danh (NULL khác NULL trong Postgres) — chống trùng theo mã NV đã chuẩn
-- hoá nằm ở code route công khai (xem src/app/api/public/document-ack/
-- [id]/submit/route.ts), giống hệt cách đã làm với procedure_training_
-- attendees ở route training-test.
