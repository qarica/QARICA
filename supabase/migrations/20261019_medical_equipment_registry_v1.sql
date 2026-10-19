-- Sổ quản lý TTBYT (trang thiết bị y tế): sổ tài sản thiết bị thực tế
-- (tên, ký hiệu, hãng/nước SX, năm SX/SD, mã máy, số lưu hành, hạn hợp
-- đồng/hiệu lực, khoa sử dụng) — KHÁC với emr_rollout_items danh mục EMR
-- "Thiết bị y tế" (THIET_BI_YTE), vốn chỉ theo dõi trạng thái kết nối với
-- EMR (Đã/Chưa kết nối), không có các trường tài sản này. Không dùng lại
-- bảng emr_medical_equipment cũ (đã bị thu hồi quyền truy cập —
-- 20260926_emr_legacy_quarantine_v1.sql) — bảng mới, độc lập, tên không có
-- tiền tố emr_ để tránh nhầm lẫn 2 nghiệp vụ khác nhau.
-- department_label lưu nguyên text "KHOA" như trong dữ liệu nguồn (không ép
-- về departments.id) vì giá trị trong các file khoa tự gửi không chuẩn hóa
-- (viết tắt/hoa-thường khác nhau, có dòng rỗng) — ép buộc khớp sai sẽ làm
-- sai lệch dữ liệu nguồn.
create table if not exists public.medical_equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  sequence_no integer,
  equipment_name text not null check (char_length(btrim(equipment_name)) between 1 and 300),
  model_code text,
  manufacturer text,
  origin_country text,
  year_manufactured integer,
  year_in_use integer,
  machine_code text,
  registration_number text,
  contract_from date,
  contract_to date,
  valid_from date,
  department_label text,
  notes text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists medical_equipment_org_active_idx
  on public.medical_equipment(organization_id, is_active);

alter table public.medical_equipment enable row level security;

drop policy if exists qlcl_authenticated_select on public.medical_equipment;
create policy qlcl_authenticated_select on public.medical_equipment
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

insert into public.permissions(code,name,description,module,is_active) values
('medical_equipment.view','Xem sổ quản lý TTBYT','Xem danh sách thiết bị y tế trong phạm vi tổ chức.','medical_equipment',true),
('medical_equipment.manage','Quản lý sổ quản lý TTBYT','Thêm/sửa/ngưng sử dụng thiết bị y tế trong phạm vi tổ chức.','medical_equipment',true)
on conflict(code) do update set name=excluded.name,description=excluded.description,module=excluded.module,is_active=true;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='tasks.view'
join public.permissions p_new on p_new.code='medical_equipment.view'
on conflict(role_id,permission_id) do nothing;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='plans.manage'
join public.permissions p_new on p_new.code='medical_equipment.manage'
on conflict(role_id,permission_id) do nothing;
