-- Yêu cầu tường minh của người dùng: Bảng kiểm QTKT nội trú và Phác đồ điều
-- trị cần 4 mức đánh giá (Đạt/Đạt 1 phần/Không đạt/Không áp dụng) thay vì chỉ
-- Đạt/Không đạt như Bảng kiểm thường quy Hồ sơ bệnh án (HSBA) — "Bảng kiểm
-- thường quy Hồ sơ bệnh án chưa đụng": route.ts tiếp tục chỉ gửi PASS/FAIL
-- cho HSBA như cũ (xem src/app/api/hsba-audit/audits/route.ts), nhưng cột đã
-- bị check constraint khóa cứng 2 giá trị nên PHAC_DO_DIEU_TRI/QTKT_NOI_TRU
-- không thể lưu PARTIAL/NA nếu không nới constraint trước.
alter table public.hsba_audit_item_results drop constraint if exists hsba_audit_item_results_result_check;
alter table public.hsba_audit_item_results add constraint hsba_audit_item_results_result_check
  check (result in ('PASS','FAIL','PARTIAL','NA'));

-- overall_result tổng hợp 1 lượt kiểm tra: FAIL nếu có bất kỳ tiêu chí FAIL,
-- PARTIAL nếu không có FAIL nhưng có tiêu chí PARTIAL, còn lại PASS (NA
-- không kéo tổng xuống — cùng quy ước "loại khỏi mẫu số tỷ lệ đạt" như module
-- Giám sát/Bảng kiểm chung đã áp dụng cho NA). HSBA chỉ bao giờ gửi PASS/FAIL
-- nên công thức này cho HSBA kết quả y hệt trước đây.
alter table public.hsba_audits drop constraint if exists hsba_audits_overall_result_check;
alter table public.hsba_audits add constraint hsba_audits_overall_result_check
  check (overall_result in ('PENDING','PASS','FAIL','PARTIAL'));
