-- Phổ biến văn bản sau khi phát hành: 2 hình thức, chọn lúc Phát hành (lúc
-- đó mới chốt nội dung cuối) — mô phỏng lại "Phiếu xác nhận thông hiểu tài
-- liệu" thực tế đã dùng trước đây, nhưng tổng quát hóa: không yêu cầu nhập
-- tay tên/mã NV/email (đã có qua auth.uid()), không khóa cứng tổ chức.
--
-- SELF_READ ("Tự đọc hiểu"): từng nhân viên tự bấm xác nhận đã đọc & hiểu —
-- theo dõi theo từng người qua document_publication_acknowledgments.
--
-- TRAINING_REQUIRED ("Cần đào tạo"): tự tạo 1 dòng trong procedure_trainings
-- ngay khi phát hành, liên kết lại qua document_publication_id — nhân viên
-- vẫn theo dõi tiến độ đào tạo bằng đúng màn hình "Đào tạo quy trình" hiện
-- có, không xây lại workflow đào tạo riêng cho văn bản.
alter table public.document_publications
  add column if not exists dissemination_type text check (dissemination_type in ('SELF_READ','TRAINING_REQUIRED'));

create table if not exists public.document_publication_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  document_publication_id uuid not null references public.document_publications(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  department_id uuid references public.departments(id),
  confirmed_at timestamptz not null default now(),
  unique (document_publication_id, user_id)
);

create index if not exists document_publication_acknowledgments_doc_idx
  on public.document_publication_acknowledgments(document_publication_id);

alter table public.document_publication_acknowledgments enable row level security;

drop policy if exists qlcl_authenticated_select on public.document_publication_acknowledgments;
create policy qlcl_authenticated_select on public.document_publication_acknowledgments
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

alter table public.procedure_trainings
  add column if not exists document_publication_id uuid references public.document_publications(id);
