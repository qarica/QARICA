-- Tiếp nhận công văn đến và trình duyệt (Tổ Đề xuất). Modeled directly off
-- the real tracking sheet ("TB.Công Văn đến 2023.xlsx") rather than forced
-- into the procurement 2-level approval shape: intake fields, a single GĐ
-- routing annotation (not an approve/reject chain), a deployment date to the
-- responsible unit, a deadline, and completion tracking. Status (đúng hạn/
-- trễ hạn/đang xử lý) is computed from completed_at vs due_date, not stored,
-- so it never goes stale like a manually-typed "Tình trạng" cell can.
create table if not exists public.incoming_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  received_at date not null,
  received_no text,
  document_date date,
  document_no text,
  issuing_authority text not null check (char_length(btrim(issuing_authority)) between 1 and 200),
  summary text not null check (char_length(btrim(summary)) between 1 and 500),
  document_type text,
  director_note text,
  department_id uuid references public.departments(id),
  deployed_at date,
  due_date date,
  completed_at date,
  completion_note text,
  progress_feedback text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incoming_documents_org_due_idx
  on public.incoming_documents(organization_id, due_date);

alter table public.incoming_documents enable row level security;

drop policy if exists qlcl_authenticated_select on public.incoming_documents;
create policy qlcl_authenticated_select on public.incoming_documents
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

insert into public.permissions(code,name,description,module,is_active) values
('incoming_documents.view','Xem công văn đến','Xem danh sách công văn đến và tiến độ xử lý trong phạm vi tổ chức.','incoming_documents',true),
('incoming_documents.manage','Quản lý công văn đến','Tiếp nhận, ghi bút phê, triển khai và theo dõi hoàn thành công văn đến.','incoming_documents',true)
on conflict(code) do update set name=excluded.name,description=excluded.description,module=excluded.module,is_active=true;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='tasks.view'
join public.permissions p_new on p_new.code='incoming_documents.view'
on conflict(role_id,permission_id) do nothing;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='plans.manage'
join public.permissions p_new on p_new.code='incoming_documents.manage'
on conflict(role_id,permission_id) do nothing;
