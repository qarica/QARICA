-- Thư viện văn bản: cho phép đính kèm file (bản scan/PDF/DOCX...) vào mỗi
-- văn bản ở document_publications, lưu trong bucket chung "qlcl-evidence"
-- (cùng bucket EMR đang dùng, theo đúng tiền lệ 1 bucket dùng chung, phân
-- vùng bằng tiền tố đường dẫn — xem src/app/api/emr/items/[id]/file/route.ts).
-- file_path (đường dẫn storage) chỉ dùng ở server (route file đọc trực tiếp,
-- không đi qua SELECT_COLUMNS chung), file_name là phần duy nhất lộ ra client
-- để hiển thị đã có file hay chưa.
alter table public.document_publications add column if not exists file_path text;
alter table public.document_publications add column if not exists file_name text;
