-- =========================================================================
-- Bổ sung chapter_code, chapter_name, score_weight vào criteria_items.
--
-- Trước migration này, criteria_items không có chỗ lưu Phần/Chương hay
-- Hệ số điểm của từng tiêu chí -- cần thiết để tính điểm trung bình chung
-- theo đúng Hướng dẫn chấm điểm 83 tiêu chí (hệ số 2 cho Chương C3, C5;
-- báo cáo điểm trung bình theo từng nhóm A/B/C/D/E).
-- =========================================================================

ALTER TABLE public.criteria_items
  ADD COLUMN IF NOT EXISTS chapter_code text,
  ADD COLUMN IF NOT EXISTS chapter_name text,
  ADD COLUMN IF NOT EXISTS score_weight integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.criteria_items.chapter_code IS 'Mã chương theo QĐ 6858, vd C3, C5 -- Phần suy ra từ ký tự đầu (A/B/C/D/E).';
COMMENT ON COLUMN public.criteria_items.chapter_name IS 'Tên chương theo QĐ 6858.';
COMMENT ON COLUMN public.criteria_items.score_weight IS 'Hệ số tính điểm trung bình chung toàn viện. Mặc định 1; Chương C3 và C5 = 2 theo Hướng dẫn chấm điểm 83 tiêu chí.';
