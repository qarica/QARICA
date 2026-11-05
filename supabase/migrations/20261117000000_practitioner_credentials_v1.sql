-- Hồ sơ năng lực hành nghề nhân viên y tế: GPHN/CCHN, văn bằng chuyên môn,
-- chứng chỉ, phạm vi hành nghề và quyết định phân công — khác hẳn
-- physician_license_registrations (bảng đó chỉ theo dõi HẠN ĐĂNG KÝ trên
-- cổng SYT/BHYT: effective_date/deadline/status, không có field nào trong
-- bảng này). Theo yêu cầu người dùng: tách bảng riêng, không gộp 2 nghiệp vụ
-- khác nhau vào 1 bảng.
create table if not exists public.practitioner_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  department_id uuid references public.departments(id),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 200),
  date_of_birth date,
  gender text,
  national_id text,
  phone text,
  email text,
  -- Loại hồ sơ hành nghề: GPHN (Giấy phép hành nghề, theo Luật Khám bệnh,
  -- chữa bệnh 15/2023/QH15), CCHN (Chứng chỉ hành nghề — tên gọi trước đây,
  -- một số hồ sơ cũ vẫn mang tên này), CCHN_DUOC (Chứng chỉ hành nghề Dược
  -- theo Luật Dược — cơ chế cấp phép riêng).
  license_type text check (license_type is null or license_type in ('GPHN','CCHN','CCHN_DUOC')),
  license_number text,
  license_issued_at date,
  license_issued_by text,
  professional_title text,
  display_title text,
  scope_of_practice text,
  scope_adjustment_text text,
  scope_adjustment_decision_no text,
  scope_adjustment_decision_at date,
  scope_adjustment_issued_by text,
  proposed_technique text,
  registration_date date,
  decision_no text,
  decision_signed_at date,
  decision_signed_by text,
  decision_status text not null default 'CHUA_SOAN' check (decision_status in ('CHUA_SOAN','DA_SOAN','DA_KY','LUU_HO_SO')),
  decision_file_url text,
  practice_status_note text,
  license_expiry_date date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists practitioner_credentials_org_idx on public.practitioner_credentials(organization_id, full_name);
create index if not exists practitioner_credentials_expiry_idx on public.practitioner_credentials(organization_id, license_expiry_date);

alter table public.practitioner_credentials enable row level security;
drop policy if exists qlcl_authenticated_select on public.practitioner_credentials;
create policy qlcl_authenticated_select on public.practitioner_credentials
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

-- Văn bằng chuyên môn, văn bằng chuyên khoa, chứng chỉ và quyết định bổ
-- sung/điều chỉnh phạm vi: số lượng không cố định theo thời gian (không
-- hard-code "tối đa 2 chứng chỉ" như cột lặp Chứng chỉ 1/Chứng chỉ 2 trong
-- file Excel gốc người dùng cung cấp) — tách bảng con generic theo
-- document_type để mở rộng tự do.
create table if not exists public.practitioner_credential_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  credential_id uuid not null references public.practitioner_credentials(id) on delete cascade,
  document_type text not null check (document_type in ('DEGREE','SPECIALIST_DEGREE','CERTIFICATE','SCOPE_ADJUSTMENT')),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  specialization text,
  document_no text,
  issued_at date,
  issued_by text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists practitioner_credential_documents_credential_idx on public.practitioner_credential_documents(credential_id, document_type);

alter table public.practitioner_credential_documents enable row level security;
drop policy if exists qlcl_authenticated_select on public.practitioner_credential_documents;
create policy qlcl_authenticated_select on public.practitioner_credential_documents
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

insert into public.permissions(code,name,description,module,is_active) values
('practitioner_credentials.view','Xem hồ sơ năng lực hành nghề','Xem hồ sơ GPHN/CCHN, văn bằng, chứng chỉ, phạm vi hành nghề nhân viên y tế trong phạm vi tổ chức.','practitioner_credentials',true),
('practitioner_credentials.manage','Quản lý hồ sơ năng lực hành nghề','Khai báo, cập nhật hồ sơ năng lực hành nghề và soạn quyết định phân công trong phạm vi tổ chức.','practitioner_credentials',true)
on conflict(code) do update set name=excluded.name,description=excluded.description,module=excluded.module,is_active=true;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='physician_license.view'
join public.permissions p_new on p_new.code='practitioner_credentials.view'
on conflict(role_id,permission_id) do nothing;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='physician_license.manage'
join public.permissions p_new on p_new.code='practitioner_credentials.manage'
on conflict(role_id,permission_id) do nothing;
