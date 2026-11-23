-- Hướng 1 ("giữ file theo từng phiên bản"): khi phát hành phiên bản mới của 1
-- văn bản, file của phiên bản cũ phải còn tra lại được thay vì bị xoá khi đính
-- file mới. document_publication_versions đã có file_name (luôn null từ trước
-- tới nay) — thêm file_path trỏ tới object trong bucket qlcl-evidence, cùng quy
-- ước đường dẫn với file hiện hành của document_publications.
-- Chỉ THÊM cột nullable, không đụng dữ liệu cũ; xác nhận trên Supabase sống
-- (CLAUDE.md nguyên tắc 6): bảng có 119 dòng, chưa có cột file_path.
alter table public.document_publication_versions add column if not exists file_path text;
