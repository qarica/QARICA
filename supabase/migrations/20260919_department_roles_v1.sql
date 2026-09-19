-- Department membership/leadership is relational master data, not duplicated person text.
create table if not exists public.department_user_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  department_id uuid not null references public.departments(id),
  user_id uuid not null references public.profiles(user_id),
  role_type text not null check (role_type in ('HEAD','DEPUTY','MEMBER')),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  valid_from date,
  valid_to date,
  created_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create unique index if not exists department_user_roles_active_unique
on public.department_user_roles(department_id,user_id,role_type)
where is_active;

create unique index if not exists department_user_roles_one_active_head
on public.department_user_roles(department_id)
where is_active and role_type='HEAD';

create index if not exists department_user_roles_user_idx
on public.department_user_roles(user_id,is_active);

alter table public.department_user_roles enable row level security;

drop policy if exists department_user_roles_authenticated_select on public.department_user_roles;
create policy department_user_roles_authenticated_select
on public.department_user_roles for select to authenticated using (true);

comment on table public.department_user_roles is
'Current and historical user roles within a department. HEAD/DEPUTY/MEMBER reference profiles; names are never duplicated.';
