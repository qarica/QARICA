-- Theo dõi hành nghề bác sĩ trên cổng SYT/BHYT (Tổ Hành chính): deadline
-- compliance tracking, not an audit/checklist and not an approval chain —
-- its own lean table, separate from Audit nội bộ KHTH and procurement.
create table if not exists public.physician_license_registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  department_id uuid not null references public.departments(id),
  physician_name text not null check (char_length(btrim(physician_name)) between 1 and 200),
  physician_code text,
  role_type text not null check (role_type in ('GDTT_TK','BS')),
  case_type text not null default 'NEW_HIRE' check (case_type in ('NEW_HIRE','INTERNAL_TRANSFER')),
  effective_date date not null,
  deadline date not null,
  status text not null default 'PENDING' check (status in ('PENDING','REGISTERED')),
  registered_at timestamptz,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists physician_license_registrations_org_status_idx
  on public.physician_license_registrations(organization_id, status, deadline);

alter table public.physician_license_registrations enable row level security;

drop policy if exists qlcl_authenticated_select on public.physician_license_registrations;
create policy qlcl_authenticated_select on public.physician_license_registrations
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

insert into public.permissions(code,name,description,module,is_active) values
('physician_license.view','Xem theo dõi hành nghề bác sĩ','Xem danh sách đăng ký hành nghề bác sĩ trong phạm vi tổ chức.','physician_license',true),
('physician_license.manage','Quản lý theo dõi hành nghề bác sĩ','Khai báo, cập nhật trạng thái đăng ký hành nghề bác sĩ trong phạm vi tổ chức.','physician_license',true)
on conflict(code) do update set name=excluded.name,description=excluded.description,module=excluded.module,is_active=true;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='tasks.view'
join public.permissions p_new on p_new.code='physician_license.view'
on conflict(role_id,permission_id) do nothing;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='plans.manage'
join public.permissions p_new on p_new.code='physician_license.manage'
on conflict(role_id,permission_id) do nothing;
