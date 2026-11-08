-- Kế hoạch công việc: công cụ phối hợp nhóm nhẹ áp dụng SMART (cấp kế
-- hoạch) + 5W1H + Eisenhower + RACI đầy đủ (cấp đầu việc) — yêu cầu tường
-- minh "áp dụng khung 5W1H/SMART/Eisenhower/RACI vào QARICA, xây thành tính
-- năng". KHÔNG dùng lại bảng actions/plans (Kế hoạch & Điều hành — Plan
-- Composer QLCL chính thức, đã có workflow/automation/materialization riêng
-- cho kế hoạch cải tiến chất lượng hàng năm): đây là khái nghiệp vụ khác —
-- 1 công cụ lập kế hoạch/phối hợp nhóm ad-hoc, nhẹ, không qua phê duyệt,
-- không vật chất hoá thành chỉ số/đánh giá/audit như Plan Composer. Tạo bảng
-- riêng đúng theo CLAUDE.md nguyên tắc 2 (một nghiệp vụ một nguồn sự thật —
-- 2 nghiệp vụ khác nhau thì KHÔNG dùng chung 1 bảng), không phải song song
-- hoá cùng 1 khái niệm.
create table if not exists public.work_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  -- SMART ở cấp kế hoạch: Specific = title; Measurable = smart_measurable;
  -- Achievable/Relevant là phán đoán người lập, không cần cột riêng;
  -- Time-bound = target_date.
  smart_measurable text,
  target_date date,
  status text not null default 'OPEN' check (status in ('OPEN','DONE','CANCELLED')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_plans_org_status_idx
  on public.work_plans(organization_id, status);

-- Đầu việc trong kế hoạch: 5W1H (What=title, Who=suy ra từ RACI vai trò R
-- bên dưới — không lặp lại 1 cột "who" riêng trùng ý nghĩa với RACI, Why/
-- Where/How/When là 4 cột dưới đây) + Eisenhower (lựa chọn trực tiếp, KHÔNG
-- tính từ due_date như personal_reminders vì đầu việc nhóm không có tín
-- hiệu "importance" độc lập để suy luận — xem src/lib/eisenhower.ts).
create table if not exists public.work_plan_items (
  id uuid primary key default gen_random_uuid(),
  work_plan_id uuid not null references public.work_plans(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  why_text text,
  where_text text,
  how_text text,
  due_date date,
  eisenhower_quadrant text not null default 'P2' check (eisenhower_quadrant in ('P1','P2','P3','P4')),
  status text not null default 'OPEN' check (status in ('OPEN','DONE','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_plan_items_plan_idx
  on public.work_plan_items(work_plan_id);

-- RACI: Responsible/Accountable/Consulted/Informed — nhiều người/nhiều vai
-- trò trên cùng 1 đầu việc. Ràng buộc "đúng 1 người A, ít nhất 1 người R"
-- enforce ở API (route.ts), không khả thi làm declarative constraint chạy
-- trên nhiều dòng bằng check constraint thường.
create table if not exists public.work_plan_item_raci (
  id uuid primary key default gen_random_uuid(),
  work_plan_item_id uuid not null references public.work_plan_items(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references public.profiles(user_id),
  raci_role text not null check (raci_role in ('R','A','C','I')),
  created_at timestamptz not null default now(),
  unique (work_plan_item_id, user_id, raci_role)
);

create index if not exists work_plan_item_raci_item_idx
  on public.work_plan_item_raci(work_plan_item_id);

alter table public.work_plans enable row level security;
alter table public.work_plan_items enable row level security;
alter table public.work_plan_item_raci enable row level security;

drop policy if exists qlcl_authenticated_select on public.work_plans;
create policy qlcl_authenticated_select on public.work_plans
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

drop policy if exists qlcl_authenticated_select on public.work_plan_items;
create policy qlcl_authenticated_select on public.work_plan_items
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

drop policy if exists qlcl_authenticated_select on public.work_plan_item_raci;
create policy qlcl_authenticated_select on public.work_plan_item_raci
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

insert into public.permissions(code,name,description,module,is_active) values
('work_plans.view','Xem kế hoạch công việc','Xem danh sách kế hoạch công việc, đầu việc và phân công RACI trong phạm vi tổ chức.','work_plans',true),
('work_plans.manage','Quản lý kế hoạch công việc','Tạo/sửa kế hoạch, đầu việc và phân công RACI (R/A/C/I) trong phạm vi tổ chức.','work_plans',true)
on conflict(code) do update set name=excluded.name,description=excluded.description,module=excluded.module,is_active=true;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='tasks.view'
join public.permissions p_new on p_new.code='work_plans.view'
on conflict(role_id,permission_id) do nothing;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='plans.manage'
join public.permissions p_new on p_new.code='work_plans.manage'
on conflict(role_id,permission_id) do nothing;
