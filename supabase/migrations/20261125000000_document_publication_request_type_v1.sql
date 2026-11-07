-- Báo cáo thực tế: "Nếu a muốn cập nhật hay thu hồi hay viết mới đều phải
-- qua đề nghị văn bản mới. Có thể đổi thành Tạo yêu cầu" — trước đây chỉ có
-- 1 luồng tạo (REQUESTED → … → PUBLISHED) cho văn bản MỚI, còn "cập nhật
-- phiên bản" là 1 đường tắt bấm Sửa, đổi ngay lập tức không qua duyệt — trái
-- với yêu cầu "mọi thay đổi phải qua yêu cầu + duyệt". Thêm request_type
-- (NEW/UPDATE/RETRACT) + target_document_id: 1 "yêu cầu" (document_publications
-- row) giờ có thể là viết văn bản mới, cập nhật phiên bản của 1 văn bản ĐÃ
-- PUBLISHED, hoặc thu hồi 1 văn bản ĐÃ PUBLISHED — cả 3 đều đi qua đúng 1
-- pipeline 6 bước như cũ, chỉ khác hiệu ứng áp dụng lúc chạm PUBLISHED (xem
-- PATCH .../[id] route.ts): NEW → chính dòng này trở thành văn bản; UPDATE →
-- áp version_label/document_code/effective_date lên target_document_id (ghi
-- thêm 1 dòng document_publication_versions cho target); RETRACT → chuyển
-- target_document_id sang stage RETRACTED (thêm vào constraint stage).
--
-- Trả lời câu hỏi "văn bản thu hồi lưu ở đâu" -> "Phải có 1 chổ là Tài liệu
-- hết hiệu lực để lưu": RETRACTED là 1 giá trị stage hợp lệ (không phải xoá
-- hay cờ ẩn), nên văn bản thu hồi vẫn còn nguyên trong document_publications
-- (lịch sử/nhân sự/trang thiết bị gắn vào vẫn tra được), chỉ khác màn hình
-- hiển thị (UI thêm panel "Tài liệu hết hiệu lực" lọc stage=RETRACTED, tách
-- khỏi "Thư viện văn bản" lọc stage=PUBLISHED).
alter table public.document_publications
  add column if not exists request_type text not null default 'NEW' check (request_type in ('NEW','UPDATE','RETRACT')),
  add column if not exists target_document_id uuid references public.document_publications(id),
  add column if not exists retracted_at timestamptz;

create index if not exists document_publications_target_document_idx
  on public.document_publications(target_document_id);

alter table public.document_publications drop constraint document_publications_stage_check;
alter table public.document_publications add constraint document_publications_stage_check
  check (stage = any (array['REQUESTED','DRAFTING','COLLECTING_FEEDBACK','REVISING','APPROVING','PUBLISHED','RETRACTED']));
