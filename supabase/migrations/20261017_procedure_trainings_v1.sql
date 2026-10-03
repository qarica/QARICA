-- Theo dõi quy trình đào tạo (phổ biến quy trình/biểu mẫu mới cho đơn vị).
-- Modeled off the real tracking sheet ("Theo dõi quy trình đào tạo.xlsx",
-- sheet TAMRI): mỗi quy trình mới ban hành là 1 hàng, theo dõi đào tạo lần 1
-- và lần 2 (nếu cần đào tạo lại) riêng biệt. Thời gian/địa điểm/cách thức đào
-- tạo giữ dạng text tự do vì dữ liệu thật không đồng nhất (có khi là ngày,
-- có khi là khung giờ, có khi là "Trong giao ban"/"Trực tuyến qua Zoom"...).
-- Tình trạng là 1 trong 3 giá trị thật sự dùng trong sổ theo dõi, không suy
-- ra được từ so sánh ngày như incoming_documents.
create table if not exists public.procedure_trainings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  procedure_code text,
  procedure_name text not null check (char_length(btrim(procedure_name)) between 1 and 500),
  drafting_unit text,
  effective_date date,
  trainer text,
  session_1_time text,
  session_1_location text,
  session_1_method text,
  status text not null default 'NOT_PLANNED' check (status in ('TRAINED','PLANNED','NOT_PLANNED')),
  feedback_qlcl text,
  session_2_time text,
  session_2_location text,
  session_2_method text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists procedure_trainings_org_status_idx
  on public.procedure_trainings(organization_id, status);

alter table public.procedure_trainings enable row level security;

drop policy if exists qlcl_authenticated_select on public.procedure_trainings;
create policy qlcl_authenticated_select on public.procedure_trainings
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

insert into public.permissions(code,name,description,module,is_active) values
('procedure_training.view','Xem theo dõi quy trình đào tạo','Xem danh sách quy trình cần đào tạo và tiến độ phổ biến trong phạm vi tổ chức.','procedure_training',true),
('procedure_training.manage','Quản lý theo dõi quy trình đào tạo','Khai báo quy trình mới, cập nhật tiến độ đào tạo lần 1/lần 2 trong phạm vi tổ chức.','procedure_training',true)
on conflict(code) do update set name=excluded.name,description=excluded.description,module=excluded.module,is_active=true;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='tasks.view'
join public.permissions p_new on p_new.code='procedure_training.view'
on conflict(role_id,permission_id) do nothing;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='plans.manage'
join public.permissions p_new on p_new.code='procedure_training.manage'
on conflict(role_id,permission_id) do nothing;
