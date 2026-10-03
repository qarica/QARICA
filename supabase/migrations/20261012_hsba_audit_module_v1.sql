-- HSBA quality-check module: standalone, not routed through the generic
-- findings/CAPA pipeline (explicit decision — HSBA checklist/error-handling
-- has its own identity, mirroring how EMR rollout tracking stays separate).
-- hsba_audits.record_reference stores only the HSBA's mã/số hồ sơ (PID) as
-- text — never clinical content — so this never becomes a second source of
-- patient data alongside HIS.

create table if not exists public.hsba_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  content text not null check (char_length(btrim(content)) between 1 and 500),
  category text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hsba_checklist_items_org_idx
  on public.hsba_checklist_items(organization_id, is_active, sort_order);

create table if not exists public.hsba_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  department_id uuid not null references public.departments(id),
  record_reference text not null check (char_length(btrim(record_reference)) between 1 and 60),
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  audited_by uuid not null references auth.users(id),
  audited_at timestamptz not null default now(),
  overall_result text not null default 'PENDING' check (overall_result in ('PENDING','PASS','FAIL')),
  status text not null default 'OPEN' check (status in ('OPEN','RETURNED','RESUBMITTED','CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hsba_audits_org_period_idx
  on public.hsba_audits(organization_id, period, department_id);

create table if not exists public.hsba_audit_item_results (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.hsba_audits(id) on delete cascade,
  checklist_item_id uuid not null references public.hsba_checklist_items(id),
  result text not null check (result in ('PASS','FAIL')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists hsba_audit_item_results_audit_idx
  on public.hsba_audit_item_results(audit_id);

create table if not exists public.hsba_audit_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  audit_id uuid not null references public.hsba_audits(id) on delete cascade,
  item_result_id uuid references public.hsba_audit_item_results(id),
  department_id uuid not null references public.departments(id),
  owner_user_id uuid references auth.users(id),
  description text not null,
  status text not null default 'OPEN' check (status in (
    'OPEN','SENT_TO_DEPT','DEPT_ACKNOWLEDGED','DEPT_DISPUTED','HEAD_APPROVED','RESOLVED'
  )),
  sent_at timestamptz,
  department_response text,
  department_responded_at timestamptz,
  head_decision text check (head_decision in ('UPHELD','WAIVED')),
  head_decided_by uuid references auth.users(id),
  head_decided_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hsba_audit_findings_org_status_idx
  on public.hsba_audit_findings(organization_id, status);
create index if not exists hsba_audit_findings_owner_idx
  on public.hsba_audit_findings(owner_user_id);

alter table public.hsba_checklist_items enable row level security;
alter table public.hsba_audits enable row level security;
alter table public.hsba_audit_item_results enable row level security;
alter table public.hsba_audit_findings enable row level security;

-- Read access open to every authenticated user in the same organization (same
-- pattern as emr_rollout_items); all writes go through API routes using the
-- service-role admin client, gated by hsba_audit.view / hsba_audit.manage.
drop policy if exists qlcl_authenticated_select on public.hsba_checklist_items;
create policy qlcl_authenticated_select on public.hsba_checklist_items
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

drop policy if exists qlcl_authenticated_select on public.hsba_audits;
create policy qlcl_authenticated_select on public.hsba_audits
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

drop policy if exists qlcl_authenticated_select on public.hsba_audit_item_results;
create policy qlcl_authenticated_select on public.hsba_audit_item_results
for select to authenticated
using (exists (
  select 1 from public.hsba_audits a
  where a.id = hsba_audit_item_results.audit_id
    and a.organization_id = (select organization_id from public.profiles where user_id = auth.uid())
));

drop policy if exists qlcl_authenticated_select on public.hsba_audit_findings;
create policy qlcl_authenticated_select on public.hsba_audit_findings
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

insert into public.permissions(code,name,description,module,is_active) values
('hsba_audit.view','Xem kiểm tra chất lượng HSBA','Xem bảng kiểm, lượt kiểm tra và lỗi HSBA trong phạm vi tổ chức.','hsba_audit',true),
('hsba_audit.manage','Quản lý kiểm tra chất lượng HSBA','Tạo/sửa bảng kiểm, ghi nhận lượt kiểm tra, xử lý lỗi HSBA trong phạm vi tổ chức.','hsba_audit',true)
on conflict(code) do update set name=excluded.name,description=excluded.description,module=excluded.module,is_active=true;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='tasks.view'
join public.permissions p_new on p_new.code='hsba_audit.view'
on conflict(role_id,permission_id) do nothing;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='plans.manage'
join public.permissions p_new on p_new.code='hsba_audit.manage'
on conflict(role_id,permission_id) do nothing;
