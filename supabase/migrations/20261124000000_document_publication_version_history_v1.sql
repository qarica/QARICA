-- Báo cáo thực tế: "Khi phát hành phiên bản mới phải có lịch sử chứ" —
-- document_publications.version_label trước đây chỉ là 1 field bị GHI ĐÈ mỗi
-- lần phát hành lần đầu (ADVANCE→PUBLISHED / nhập trực tiếp) hoặc phát hành
-- phiên bản mới (EDIT khi đã PUBLISHED): phiên bản cũ biến mất khỏi UI, chỉ
-- còn lại trong audit_logs (không phải nơi người dùng tra cứu lịch sử phiên
-- bản). Thêm bảng lịch sử append-only — mỗi lần version_label được chốt
-- (lần đầu phát hành hoặc phát hành lại) ghi thêm 1 dòng, KHÔNG xoá/sửa dòng
-- cũ — xem recordDocumentVersion() trong document-publication-server.ts,
-- gọi từ cả 3 nơi version_label được set (POST direct_publish, PATCH
-- ADVANCE→PUBLISHED, PATCH EDIT khi đã PUBLISHED).
create table if not exists public.document_publication_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  document_publication_id uuid not null references public.document_publications(id) on delete cascade,
  version_label text not null,
  document_code text,
  effective_date date,
  file_name text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists document_publication_versions_doc_idx
  on public.document_publication_versions(document_publication_id, created_at desc);

alter table public.document_publication_versions enable row level security;

drop policy if exists qlcl_authenticated_select on public.document_publication_versions;
create policy qlcl_authenticated_select on public.document_publication_versions
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));
