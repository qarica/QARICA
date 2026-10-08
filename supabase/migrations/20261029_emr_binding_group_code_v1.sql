-- Yêu cầu: hiển thị "Cấu trúc gáy HSBA" đẹp như hệ thống tham khảo (Mã nhóm
-- gáy dạng số La Mã tách riêng khỏi tên đầy đủ của nhóm, vd mã "V" + tên
-- "V. Giấy, phiếu đánh giá, theo dõi, chăm sóc của điều dưỡng").
--
-- emr_binding_groups.name hiện tại là text tự do (per-org master data, xem
-- 20261004_emr_binding_groups_v1.sql) — thêm cột `code` (cũng tự do, KHÔNG
-- hard-code danh sách La Mã cố định, vì số nhóm/cách đặt mã gáy khác nhau
-- theo từng viện) để tách hiển thị mã ngắn khỏi tên đầy đủ, không đổi cách
-- lưu `name`.
alter table public.emr_binding_groups add column if not exists code text;
