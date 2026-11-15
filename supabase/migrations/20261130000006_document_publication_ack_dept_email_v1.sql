-- Phản hồi thực tế sau khi tự quét QR thử: "nhập tên nv và mã số nhưng
-- thiếu khoa phòng" + "phần mềm phải lưu lại email hoặc thời gian của nhân
-- viên xác nhận". Thời gian đã được lưu từ trước (confirmed_at default
-- now() — migration 20261021), không cần thêm cột. Bổ sung 2 phần còn
-- thiếu để có đủ "bằng chứng" xác nhận ẩn danh qua link công khai:
--   - department_id: TÁI DÙNG cột department_id đã có sẵn trên bảng này
--     (trước đây chỉ gán cho xác nhận qua tài khoản) — không tạo cột khoa/
--     phòng dạng text riêng, tránh 1 nghiệp vụ "khoa/phòng của người xác
--     nhận" có 2 nguồn khác nhau (CLAUDE.md nguyên tắc 2). Route công khai
--     sẽ chọn department_id từ danh sách khoa/phòng thật của tổ chức (GET
--     trả kèm), không phải tự gõ tay dễ sai chính tả/trùng tên.
--   - email: nhân viên ẩn danh có thể không khớp đúng 1 tài khoản QARICA
--     nào để tra email tự động, nên cho nhập tay (tuỳ chọn) làm thêm 1 lớp
--     bằng chứng xác nhận ngoài Họ tên + mã NV.
alter table public.document_publication_acknowledgments
  add column if not exists email text;
