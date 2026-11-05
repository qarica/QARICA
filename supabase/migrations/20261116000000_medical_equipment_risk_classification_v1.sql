-- Sổ quản lý TTBYT: thêm trường "Phân loại TTBYT" (A/B/C/D) theo phân loại
-- mức độ rủi ro quy định tại Điều 4 Nghị định 98/2021/NĐ-CP (Chương II —
-- PHÂN LOẠI TRANG THIẾT BỊ Y TẾ): Loại A rủi ro thấp, B trung bình thấp,
-- C trung bình cao, D rủi ro cao. Đã đối chiếu Nghị định 07/2023/NĐ-CP và
-- Nghị định 04/2025/NĐ-CP (2 nghị định sửa đổi, bổ sung NĐ 98/2021) — cả
-- hai đều KHÔNG sửa Điều 4/Điều 5, cấu trúc 4 loại A/B/C/D giữ nguyên.
--
-- Lưu ý: Thông tư 57/2025/TT-BYT (văn bản thứ 4 được cung cấp) là MỘT HỆ
-- THỐNG PHÂN LOẠI KHÁC — "phân nhóm thiết bị y tế theo tiêu chuẩn kỹ thuật,
-- chất lượng" (Nhóm 1-6), phục vụ mục đích đấu thầu mua sắm theo Luật Đấu
-- thầu/Nghị định 214/2025/NĐ-CP, không liên quan đến phân loại rủi ro A/B/
-- C/D. Không trộn 2 hệ thống vào cùng 1 cột — nếu sau này cần thêm phân
-- nhóm đấu thầu, phải là cột riêng (ví dụ procurement_group 1-6).
--
-- Trường này chỉ lưu KẾT QUẢ phân loại (A/B/C/D) do người có chuyên môn
-- QLCL tự xác định cho từng thiết bị — hệ thống không tự suy ra/gán phân
-- loại, nullable, không bắt buộc.
alter table public.medical_equipment add column if not exists risk_classification text;
alter table public.medical_equipment drop constraint if exists medical_equipment_risk_classification_check;
alter table public.medical_equipment add constraint medical_equipment_risk_classification_check
  check (risk_classification is null or risk_classification in ('A','B','C','D'));
