alter table public.audit_scopes
  add column if not exists process_name text,
  add column if not exists area_name text;

alter table public.audit_sessions
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end timestamptz,
  add column if not exists department_id uuid,
  add column if not exists location text,
  add column if not exists session_status text not null default 'PLANNED';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.audit_sessions'::regclass
      and conname='audit_sessions_department_id_fkey'
  ) then
    alter table public.audit_sessions
      add constraint audit_sessions_department_id_fkey
      foreign key (department_id) references public.departments(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.audit_sessions'::regclass
      and conname='audit_sessions_session_status_check'
  ) then
    alter table public.audit_sessions
      add constraint audit_sessions_session_status_check
      check (session_status in ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.audit_sessions'::regclass
      and conname='audit_sessions_time_window_check'
  ) then
    alter table public.audit_sessions
      add constraint audit_sessions_time_window_check
      check (scheduled_end is null or scheduled_start is null or scheduled_end > scheduled_start);
  end if;
end
$$;
