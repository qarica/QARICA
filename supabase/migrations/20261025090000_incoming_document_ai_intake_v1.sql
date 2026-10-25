-- Yêu cầu: tham khảo luồng "Upload văn bản → AI tự đọc & điền → kiểm tra →
-- tạo công việc với Chủ trì/Phối hợp" từ một app ngoài, áp dụng cho module
-- Công văn đến (incoming_documents) hiện có của QARICA.
--
-- Phần 1: incoming_documents có thêm file_path/file_name để giữ lại bản gốc
-- PDF/DOCX đã tải lên (đính kèm sau khi tạo, theo đúng quy ước "lưu trước,
-- đính kèm sau" đã dùng ở document_publications).
alter table public.incoming_documents
  add column if not exists file_path text,
  add column if not exists file_name text;

-- Phần 2: incoming_document_tasks — "Tạo công việc từ văn bản" với một người
-- chủ trì (bắt buộc) + nhiều người phối hợp (không bắt buộc). Đây là bảng
-- liên kết RIÊNG cho công văn đến, không gộp vào bảng actions của Registry
-- (records) vì incoming_documents là bảng độc lập ngoài Registry từ trước,
-- không có record_id để liên kết qua cơ chế actions chung.
create table if not exists public.incoming_document_tasks(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  incoming_document_id uuid not null references public.incoming_documents(id) on delete cascade,
  title text not null,
  description text,
  lead_user_id uuid not null,
  collaborating_user_ids uuid[] not null default '{}'::uuid[],
  due_date date,
  completed_at date,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_incoming_document_tasks_document on public.incoming_document_tasks(incoming_document_id);
create index if not exists idx_incoming_document_tasks_org on public.incoming_document_tasks(organization_id);

alter table public.incoming_document_tasks enable row level security;

drop policy if exists qlcl_authenticated_select on public.incoming_document_tasks;
create policy qlcl_authenticated_select on public.incoming_document_tasks
  for select to authenticated
  using (organization_id = (select profiles.organization_id from public.profiles where profiles.user_id = (select auth.uid())));

revoke all on public.incoming_document_tasks from public, anon, authenticated;
grant select on public.incoming_document_tasks to authenticated;
grant select, insert, update, delete on public.incoming_document_tasks to service_role;

comment on table public.incoming_document_tasks is 'Công việc được tạo trực tiếp từ một công văn đến, có 1 người chủ trì và nhiều người phối hợp. Ghi/sửa luôn qua service_role (API route), người dùng chỉ đọc qua RLS.';
