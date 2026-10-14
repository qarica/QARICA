-- RECONCILIATION: đã áp trực tiếp lên Supabase sống ngày 2026-10-11 09:08, không qua repo.
-- Di chuyển dữ liệu thật: gộp 4 role cũ (ADMIN/EXECUTIVE/TRUONG_KHOA_PHONG/NHAN_VIEN)
-- vào role chuẩn tương ứng (SYSTEM_ADMIN/BAN_GIAM_DOC/DEPARTMENT_HEAD/USER), giữ alias
-- để tương thích ngược, rồi deactivate role cũ. Idempotent (on conflict do update).
create table if not exists public.role_aliases (
  alias_code text primary key,
  canonical_role_id uuid not null references public.roles(id) on delete restrict,
  note text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.role_aliases enable row level security;
revoke all on public.role_aliases from anon;
grant select on public.role_aliases to authenticated;

drop policy if exists role_aliases_authenticated_select on public.role_aliases;
create policy role_aliases_authenticated_select
on public.role_aliases for select to authenticated
using (true);

insert into public.role_aliases(alias_code,canonical_role_id,note)
select v.alias_code,r.id,v.note
from (values
  ('ADMIN','SYSTEM_ADMIN','Legacy alias; permission-equivalent to SYSTEM_ADMIN.'),
  ('EXECUTIVE','BAN_GIAM_DOC','Legacy alias; permission-equivalent to BAN_GIAM_DOC.'),
  ('TRUONG_KHOA_PHONG','DEPARTMENT_HEAD','Legacy alias; permission-equivalent to DEPARTMENT_HEAD.'),
  ('NHAN_VIEN','USER','Legacy alias; permission-equivalent to USER.')
) as v(alias_code,canonical_code,note)
join public.roles r on r.code=v.canonical_code
on conflict(alias_code) do update
set canonical_role_id=excluded.canonical_role_id,
    note=excluded.note,
    is_active=true;

do $$
declare
  rec record;
  alias_role_id uuid;
  canonical_role_id uuid;
  alias_only integer;
  canonical_only integer;
begin
  for rec in
    select * from (values
      ('ADMIN','SYSTEM_ADMIN'),
      ('EXECUTIVE','BAN_GIAM_DOC'),
      ('TRUONG_KHOA_PHONG','DEPARTMENT_HEAD'),
      ('NHAN_VIEN','USER')
    ) as p(alias_code,canonical_code)
  loop
    select id into alias_role_id from public.roles where code=rec.alias_code;
    select id into canonical_role_id from public.roles where code=rec.canonical_code;

    if alias_role_id is null or canonical_role_id is null then
      raise exception 'Missing role pair % -> %', rec.alias_code, rec.canonical_code;
    end if;

    select count(*) into alias_only
    from public.role_permissions a
    where a.role_id=alias_role_id
      and not exists (
        select 1 from public.role_permissions c
        where c.role_id=canonical_role_id and c.permission_id=a.permission_id
      );

    select count(*) into canonical_only
    from public.role_permissions c
    where c.role_id=canonical_role_id
      and not exists (
        select 1 from public.role_permissions a
        where a.role_id=alias_role_id and a.permission_id=c.permission_id
      );

    if alias_only <> 0 or canonical_only <> 0 then
      raise exception 'Role permissions diverged for % -> %', rec.alias_code, rec.canonical_code;
    end if;

    insert into public.user_roles(user_id,role_id,assigned_by,created_at)
    select ur.user_id,canonical_role_id,ur.assigned_by,ur.created_at
    from public.user_roles ur
    where ur.role_id=alias_role_id
    on conflict(user_id,role_id) do nothing;

    delete from public.user_roles where role_id=alias_role_id;

    update public.roles set is_active=false where id=alias_role_id;
  end loop;
end $$;
