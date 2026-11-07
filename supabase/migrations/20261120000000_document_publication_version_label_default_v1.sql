-- Báo cáo thực tế: "Ghi dự thảo dễ hiểu nhầm" — document_publications.
-- version_label có default 'Dự thảo 01', nhưng field này giờ được điền thật
-- khi văn bản Phát hành (xem commit "Kiểm soát tài liệu: thêm Lần phát hành
-- để kiểm soát phiên bản"). Một văn bản đã PUBLISHED mà vẫn hiện "Dự thảo
-- 01" là mâu thuẫn/gây hiểu nhầm (đọc như còn là bản nháp). Đổi default
-- sang chữ trung tính, không khẳng định trạng thái nào (không phải "dự
-- thảo", cũng không bịa 1 số lần phát hành không có thật).
alter table public.document_publications
  alter column version_label set default 'Chưa cập nhật';

-- Sửa lại dữ liệu cũ đang kẹt ở giá trị default cũ — không giới hạn theo
-- stage vì default cũ gây hiểu nhầm ở bất kỳ stage nào, không riêng
-- PUBLISHED.
update public.document_publications
set version_label = 'Chưa cập nhật'
where version_label = 'Dự thảo 01';
