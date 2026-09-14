QLCL-TTSG - TQM SMART OPS V6

Mục tiêu batch:
1) Bổ sung Production Schema Compatibility V2 để source hiện tại khớp schema Supabase greenfield.
2) Thêm Smart TQM Command Center vào Dashboard chính:
   - Chỉ số vận hành TQM dựa trên 6 trụ cột
   - Smart Quality Priority Index
   - Gợi ý ưu tiên deterministic từ dữ liệu thật
   - Không bịa dữ liệu; thiếu mẫu hiển thị “Chưa đủ dữ liệu”
3) Nâng Trợ lý QLCL:
   - System Priority 0–100
   - Mức tín hiệu Xanh/Vàng/Cam/Đỏ
   - Giữ nguyên nguyên tắc: gợi ý, không tự quyết định nghiệp vụ

THỨ TỰ TRIỂN KHAI:
A. Chạy QLCL_TTSG_15_SCHEMA_COMPATIBILITY_V2.sql trên Supabase SQL Editor.
   Kết quả cuối cần:
   result = QLCL_SCHEMA_COMPATIBILITY_V2_PASS
   indicator_result_level_ok = true
   incident_summary_ok = true
   risk_location_ok = true
   action_view_work_year_ok = true

B. Upload/overwrite 3 file code:
   src/components/tqm-smart-command-center.tsx
   src/app/(app)/dashboard/page.tsx
   src/app/(app)/assistant/page.tsx

C. Commit GitHub → chờ Vercel Production Ready.

D. Kiểm tra:
   /dashboard
   /assistant

LƯU Ý:
- Batch này không thay các file Auth đang chạy tốt.
- Không xóa dữ liệu.
- Không dùng số giả.
