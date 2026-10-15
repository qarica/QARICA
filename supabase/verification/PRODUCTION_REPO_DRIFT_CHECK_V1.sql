-- PRODUCTION_REPO_DRIFT_CHECK_V1
-- Chạy tay trong Supabase SQL Editor (hoặc qua Supabase MCP execute_sql) định kỳ,
-- đặc biệt trước khi báo "đã xong" cho bất kỳ migration/fix nào.
--
-- Lý do tồn tại: phát hiện thực tế 14-15/10/2026 — supabase_migrations.schema_migrations
-- KHÔNG phải nguồn đầy đủ để biết "cái gì đã thật sự chạy trên production". Hàng
-- chục migration đã merge vào main (kể cả fix bug nghiêm trọng) không hề được áp
-- lên production; ngược lại nhiều thay đổi schema/dữ liệu đã áp trực tiếp mà
-- không qua cơ chế migration (không có trong bảng này). Script này không "phát
-- hiện" được phần thứ 2 (vì chính bảng tracking này thiếu dữ liệu đó) — chỉ giúp
-- so sánh NHANH với `ls supabase/migrations/ | tail -40` để người/agent tiếp theo
-- tự đối chiếu bằng mắt, không thay thế việc query trực tiếp information_schema/
-- pg_proc cho từng migration cụ thể cần xác nhận (xem CLAUDE.md nguyên tắc #6).
select version, name
from supabase_migrations.schema_migrations
order by version desc
limit 40;

-- Đối chiếu tay: mọi file trong supabase/migrations/ có timestamp mới hơn
-- MAX(version) ở trên mà KHÔNG xuất hiện trong danh sách này là ứng viên
-- "chưa áp lên production" — cần verify trực tiếp (không suy luận) bằng cách đọc
-- nội dung file đó, xác định bảng/cột/hàm nó tạo/sửa, rồi query information_schema
-- hoặc pg_proc.prosrc để xác nhận đối tượng đó đã tồn tại đúng dạng mong đợi hay chưa.
