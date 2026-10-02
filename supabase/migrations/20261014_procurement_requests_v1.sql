-- Đề xuất mua sắm/sửa chữa: standalone 2-level approval workflow (Tổ Đề xuất).
-- No patient data, no audit-checklist shape — doesn't fit the "Audit nội bộ
-- KHTH" engine (hsba_*) or the generic records/findings pipeline, so it gets
-- its own lean table rather than being forced into either.
create table if not exists public.procurement_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  department_id uuid not null references public.departments(id),
  request_type text not null check (request_type in ('NEW_PURCHASE','REPAIR','TRANSFER')),
  urgency text not null default 'NORMAL' check (urgency in ('NORMAL','URGENT')),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  description text,
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now(),
  status text not null default 'SUBMITTED' check (status in (
    'SUBMITTED','BGD_APPROVED','BGD_REJECTED','TGD_APPROVED','TGD_REJECTED','NOTIFIED'
  )),
  bgd_decided_by uuid references auth.users(id),
  bgd_decided_at timestamptz,
  bgd_note text,
  tgd_decided_by uuid references auth.users(id),
  tgd_decided_at timestamptz,
  tgd_note text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists procurement_requests_org_status_idx
  on public.procurement_requests(organization_id, status, submitted_at);

alter table public.procurement_requests enable row level security;

drop policy if exists qlcl_authenticated_select on public.procurement_requests;
create policy qlcl_authenticated_select on public.procurement_requests
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

insert into public.permissions(code,name,description,module,is_active) values
('procurement.view','Xem đề xuất mua sắm','Xem đề xuất mua sắm/sửa chữa trong phạm vi tổ chức.','procurement',true),
('procurement.manage','Quản lý đề xuất mua sắm','Tiếp nhận, duyệt (BGĐ/TGĐ) và thông báo kết quả đề xuất mua sắm/sửa chữa.','procurement',true)
on conflict(code) do update set name=excluded.name,description=excluded.description,module=excluded.module,is_active=true;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='tasks.view'
join public.permissions p_new on p_new.code='procurement.view'
on conflict(role_id,permission_id) do nothing;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='plans.manage'
join public.permissions p_new on p_new.code='procurement.manage'
on conflict(role_id,permission_id) do nothing;
