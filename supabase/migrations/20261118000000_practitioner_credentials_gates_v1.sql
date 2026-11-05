-- Theo rà soát nghiệp vụ sau khi ship practitioner_credentials
-- (20261117000000): 4 khoảng hở được xử lý trong migration này.

-- 1) Dọn trùng lặp: "phạm vi bổ sung/điều chỉnh" trước đây vừa có ở cột phẳng
-- trên practitioner_credentials (chỉ giữ được 1 bản ghi "hiện tại"), vừa có ở
-- bảng con practitioner_credential_documents (document_type='SCOPE_ADJUSTMENT',
-- lưu được nhiều lần theo thời gian) — 2 nơi cho cùng 1 sự thật, dễ lệch nếu
-- người dùng chỉ cập nhật 1 trong 2 chỗ. Bảng chưa có dữ liệu thật (mới tạo),
-- xoá hẳn 4 cột phẳng, chỉ còn đúng 1 nguồn (bảng con).
alter table public.practitioner_credentials drop column if exists scope_adjustment_text;
alter table public.practitioner_credentials drop column if exists scope_adjustment_decision_no;
alter table public.practitioner_credentials drop column if exists scope_adjustment_decision_at;
alter table public.practitioner_credentials drop column if exists scope_adjustment_issued_by;

-- 2) Go-live gate cho decision_status='DA_KY' (mô phỏng đúng nguyên tắc gate
-- của emr_rollout_items: chỉ PASS/ký chính thức khi có minh chứng + đã được
-- người KHÁC xác minh) — trước đây ai có quyền manage cũng tự đặt được
-- "Đã ký" mà không cần bằng chứng gì. decision_file_url (text tự do, không
-- thật) bị thay bằng file lưu trong Storage thật (decision_file_path +
-- decision_file_name), và updated_by để biết ai vừa sửa gần nhất cho kiểm
-- soát "4 mắt" (người xác minh phải khác người vừa sửa).
alter table public.practitioner_credentials drop column if exists decision_file_url;
alter table public.practitioner_credentials add column if not exists decision_file_path text;
alter table public.practitioner_credentials add column if not exists decision_file_name text;
alter table public.practitioner_credentials add column if not exists decision_verified_at timestamptz;
alter table public.practitioner_credentials add column if not exists decision_verified_by uuid references auth.users(id);
alter table public.practitioner_credentials add column if not exists updated_by uuid references auth.users(id);

-- 3) Liên kết 2 bảng "hành nghề" (trước đây chỉ gộp chung ở menu, chưa liên
-- kết dữ liệu): 1 đăng ký hành nghề trên cổng SYT/BHYT (physician_license_registrations)
-- có thể trỏ tới đúng hồ sơ năng lực hành nghề (practitioner_credentials) của
-- người đó, nếu đã khai báo. Nullable — không bắt buộc, vì không phải mọi
-- physician_license_registrations đều đã có hồ sơ năng lực tương ứng.
alter table public.physician_license_registrations add column if not exists credential_id uuid references public.practitioner_credentials(id);
create index if not exists physician_license_registrations_credential_idx on public.physician_license_registrations(credential_id);
