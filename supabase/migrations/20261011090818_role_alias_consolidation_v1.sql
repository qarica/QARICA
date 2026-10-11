-- Source reconciliation of the already-applied production migration.
-- Preparation only: no live roles or grants are deleted or remapped.
create table if not exists public.role_aliases (
  alias_code text primary key,
  canonical_role_id uuid not null references public.roles(id) on delete restrict,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.role_aliases enable row level security;
with pairs(alias_code,canonical_code) as (
 values ('ADMIN','SYSTEM_ADMIN'),('EXECUTIVE','BAN_GIAM_DOC'),
 ('NHAN_VIEN','USER'),('TRUONG_KHOA_PHONG','DEPARTMENT_HEAD')
), verified as (
 select a.code alias_code,c.id canonical_role_id,c.code canonical_code
 from pairs p join public.roles a on a.code=p.alias_code
 join public.roles c on c.code=p.canonical_code
 where not exists (
   (select permission_id from public.role_permissions where role_id=a.id
    except select permission_id from public.role_permissions where role_id=c.id)
   union all
   (select permission_id from public.role_permissions where role_id=c.id
    except select permission_id from public.role_permissions where role_id=a.id)
 )
)
insert into public.role_aliases(alias_code,canonical_role_id,note)
select alias_code,canonical_role_id,'Legacy alias; permission-equivalent to '||canonical_code||'.'
from verified on conflict (alias_code) do nothing;
