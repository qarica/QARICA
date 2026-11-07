-- Báo cáo thực tế: "sơ đồ tổ chức ... vẽ sơ đồ bố trí theo tầng" — tham
-- khảo 1 sơ đồ mặt bằng theo tầng (lưới các khoa/phòng theo tầng, màu theo
-- loại đơn vị) đã làm ở nơi khác cho 1 bệnh viện cụ thể, nhưng QARICA không
-- hard-code mặt bằng 1 bệnh viện — thêm field cấu hình chung để TỪNG tổ
-- chức tự nhập tầng/phòng/diện tích của chính mình (không có giá trị mặc
-- định, admin điền qua trang Khoa/Phòng).
-- floor_order: số nguyên để sắp xếp tầng (tầng cao hơn = số lớn hơn, "Tầng
-- hầm" dùng số âm/nhỏ nhất) — floor_label là chữ tự do hiển thị ("Tầng 1",
-- "Tầng hầm"...) vì không phải tổ chức nào cũng đặt tên tầng theo số.
alter table public.departments
  add column if not exists floor_order integer,
  add column if not exists floor_label text,
  add column if not exists room_label text,
  add column if not exists area_sqm numeric;
