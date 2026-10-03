-- Phát hành văn bản (document issuance workflow) — modeled off a real,
-- mature reference workflow the user built and ran before (6-stage pipeline:
-- Đề nghị → Soạn thảo → Góp ý → Rà soát → Phê duyệt & trình ký → Phát hành;
-- 4 document types, each with its own approval level). Generalized for
-- QARICA's multi-organization architecture: no hard-coded hospital name, no
-- hard-coded "P.KHTH-QLCL"/"P. Điều dưỡng" department — the reviewing
-- department for a request is whichever department the creator assigns
-- (drafting_department_id), and advancing past the initial request requires
-- document_publication.manage like every other QLCL-wide control step.
-- Document code is entered manually at the Phát hành step (not auto-minted
-- with an org-specific prefix), same as incoming_documents.document_no.
create table if not exists public.document_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  document_type text not null check (document_type in ('OPERATIONAL','CLINICAL_PROCEDURE','CLINICAL_PROTOCOL','NURSING')),
  drafting_department_id uuid references public.departments(id),
  requested_by_name text,
  reason text,
  version_label text not null default 'Dự thảo 01',
  stage text not null default 'REQUESTED' check (stage in ('REQUESTED','DRAFTING','COLLECTING_FEEDBACK','REVISING','APPROVING','PUBLISHED')),
  stage_due_date date,
  current_owner_label text,
  document_code text,
  effective_date date,
  review_date date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_publications_org_stage_idx
  on public.document_publications(organization_id, stage, stage_due_date);

alter table public.document_publications enable row level security;

drop policy if exists qlcl_authenticated_select on public.document_publications;
create policy qlcl_authenticated_select on public.document_publications
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

insert into public.permissions(code,name,description,module,is_active) values
('document_publication.view','Xem phát hành văn bản','Xem danh sách và tiến độ các văn bản đang soạn thảo/phát hành trong phạm vi tổ chức.','document_publication',true),
('document_publication.manage','Quản lý phát hành văn bản','Kiểm soát nội dung, phê duyệt, trình ký và phát hành văn bản.','document_publication',true)
on conflict(code) do update set name=excluded.name,description=excluded.description,module=excluded.module,is_active=true;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='tasks.view'
join public.permissions p_new on p_new.code='document_publication.view'
on conflict(role_id,permission_id) do nothing;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='plans.manage'
join public.permissions p_new on p_new.code='document_publication.manage'
on conflict(role_id,permission_id) do nothing;
