-- Kiểm soát nhiễm khuẩn (Infection Prevention & Control — IPC): mảng bắt
-- buộc trong Bộ tiêu chí chất lượng bệnh viện, trước đây QARICA chưa có
-- module riêng (khác Sổ quản lý TTBYT, khác Sự cố & Phản ánh). Phạm vi đã
-- chốt tường minh với người dùng: Giám sát nhiễm khuẩn bệnh viện (HAI) +
-- Giám sát tuân thủ vệ sinh tay — KHÔNG làm riêng phơi nhiễm nghề nghiệp/kim
-- đâm (dùng chung module Sự cố & Phản ánh đã có, tránh trùng lặp theo
-- CLAUDE.md nguyên tắc "một nghiệp vụ chỉ có một nguồn sự thật").
--
-- patient_code (nếu có) chỉ là mã nội bộ tham chiếu, KHÔNG lưu thông tin
-- định danh bệnh nhân (tên, ngày sinh, số CCCD...) — QARICA không phải phần
-- mềm lâm sàng thao tác hồ sơ bệnh nhân.
create table if not exists public.infection_control_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  department_id uuid references public.departments(id),
  patient_code text,
  detected_date date not null,
  infection_site text not null,
  pathogen text,
  related_procedure text,
  status text not null default 'NGHI_NGO' check (status in ('NGHI_NGO','XAC_NHAN','DA_XU_LY')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists infection_control_cases_org_idx on public.infection_control_cases(organization_id, detected_date);

alter table public.infection_control_cases enable row level security;
drop policy if exists qlcl_authenticated_select on public.infection_control_cases;
create policy qlcl_authenticated_select on public.infection_control_cases
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

-- Mỗi dòng là 1 đợt giám sát (vd 1 buổi quan sát tại 1 khoa) — tỷ lệ tuân
-- thủ tính từ opportunities_compliant/opportunities_observed, không lưu cột
-- tính sẵn để tránh lệch khi dữ liệu gốc sửa sau (tính trực tiếp ở API/UI).
create table if not exists public.hand_hygiene_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  department_id uuid references public.departments(id),
  audit_date date not null,
  observer_user_id uuid references auth.users(id),
  staff_role text,
  opportunities_observed integer not null check (opportunities_observed >= 0),
  opportunities_compliant integer not null check (opportunities_compliant >= 0),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hand_hygiene_compliant_le_observed check (opportunities_compliant <= opportunities_observed)
);

create index if not exists hand_hygiene_audits_org_idx on public.hand_hygiene_audits(organization_id, audit_date);

alter table public.hand_hygiene_audits enable row level security;
drop policy if exists qlcl_authenticated_select on public.hand_hygiene_audits;
create policy qlcl_authenticated_select on public.hand_hygiene_audits
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

insert into public.permissions(code,name,description,module,is_active) values
('infection_control.view','Xem kiểm soát nhiễm khuẩn','Xem ca nhiễm khuẩn bệnh viện và đợt giám sát vệ sinh tay trong phạm vi tổ chức.','infection_control',true),
('infection_control.manage','Quản lý kiểm soát nhiễm khuẩn','Ghi nhận, cập nhật ca nhiễm khuẩn bệnh viện và đợt giám sát vệ sinh tay trong phạm vi tổ chức.','infection_control',true)
on conflict(code) do update set name=excluded.name,description=excluded.description,module=excluded.module,is_active=true;

-- Neo quyền mặc định vào Đo lường & Giám sát (monitoring) — hoạt động IPC
-- gần nhất với công tác giám sát/đo lường định kỳ QLCL đang làm.
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='monitoring.view'
join public.permissions p_new on p_new.code='infection_control.view'
on conflict(role_id,permission_id) do nothing;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='monitoring.perform'
join public.permissions p_new on p_new.code='infection_control.manage'
on conflict(role_id,permission_id) do nothing;
