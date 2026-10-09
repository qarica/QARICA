-- Yêu cầu thực tế: "E back lại tất cả biểu mẫu đang có về chưa duyệt để anh
-- duyệt lại" — migration 20261031 đã backfill publish_status='PUBLISHED' cho
-- mọi Biểu mẫu có sẵn (để không đột ngột mất khỏi tiến độ/phạm vi áp dụng khi
-- vừa thêm tính năng duyệt phát hành). Người dùng muốn tự duyệt lại thủ công
-- từng biểu mẫu qua nút "Duyệt phát hành" thay vì giữ nguyên backfill đó.
--
-- Chỉ tác động category='BIEU_MAU' — các danh mục EMR khác dùng chung cột
-- publish_status (do backfill PUBLISHED từ migration 20261031) nhưng không có
-- quy trình duyệt phát hành, không được đụng tới.
--
-- Không xoá department_ids/record_types/status đã gán — chỉ đưa publish_status
-- về 'DRAFT' và xoá published_at/published_by. Dữ liệu đã khai báo (khoa áp
-- dụng, loại hồ sơ, tiến độ triển khai) vẫn giữ nguyên, chỉ bị khoá KHÔNG CHO
-- SỬA cho tới khi duyệt phát hành lại (gate đã có sẵn ở PATCH route).
update public.emr_rollout_items
set publish_status = 'DRAFT', published_at = null, published_by = null
where category = 'BIEU_MAU';
