-- QLCL-TTSG Record Department Participants V1
-- Adds secondary department participation without changing record/incident access.
-- The primary/lead department remains records.owner_department_id (and domain lead fields).

begin;

create table if not exists public.record_department_participants (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete restrict,
  participant_role text not null check (participant_role in ('RELATED','COORDINATING','CONSULTED','INFORMED')),
  participation_scope text,
  added_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint record_department_participants_scope_length
    check (participation_scope is null or char_length(participation_scope) <= 1000),
  constraint record_department_participants_unique
    unique(record_id, department_id)
);

create index if not exists record_department_participants_record_idx
  on public.record_department_participants(record_id, created_at);
create index if not exists record_department_participants_department_idx
  on public.record_department_participants(department_id, participant_role);

alter table public.record_department_participants enable row level security;

drop policy if exists record_department_participants_select_via_record
  on public.record_department_participants;
create policy record_department_participants_select_via_record
  on public.record_department_participants
  for select
  to authenticated
  using (public.can_access_record(record_id));

-- Intentionally no authenticated INSERT/UPDATE/DELETE policy. Mutations go through
-- the service-role-only RPC below after the API checks the module permission.
-- The SELECT policy deliberately depends on can_access_record(record_id), while
-- can_access_record does not depend on this table. Therefore participation does
-- not grant access to a confidential record (especially an incident case).

create or replace function public.qlcl_change_record_department_participant_v1(
  p_record_id uuid,
  p_actor_user_id uuid,
  p_operation text,
  p_department_id uuid,
  p_participant_role text,
  p_participation_scope text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_record public.records%rowtype;
  v_operation text:=upper(trim(coalesce(p_operation,'')));
  v_role text:=upper(trim(coalesce(p_participant_role,'')));
  v_scope text:=nullif(trim(coalesce(p_participation_scope,'')),'');
  v_participant public.record_department_participants%rowtype;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if p_department_id is null then raise exception 'department_id is required'; end if;
  if v_operation not in ('UPSERT','REMOVE') then raise exception 'Invalid participant operation'; end if;
  if v_role not in ('RELATED','COORDINATING','CONSULTED','INFORMED') then raise exception 'Invalid participant role'; end if;
  if v_scope is not null and char_length(v_scope)>1000 then raise exception 'Participation scope is too long'; end if;

  select * into v_record from public.records where id=p_record_id for update;
  if not found then raise exception 'Record not found'; end if;
  if v_record.lifecycle_status<>'ACTIVE' then raise exception 'Record must be ACTIVE'; end if;
  if v_record.owner_department_id=p_department_id then
    raise exception 'Primary department cannot be duplicated as a secondary participant';
  end if;
  if not exists(
    select 1 from public.profiles p
    where p.user_id=p_actor_user_id and p.organization_id=v_record.organization_id and p.is_active
  ) then raise exception 'Actor is invalid or outside organization'; end if;
  if not exists(
    select 1 from public.departments d
    where d.id=p_department_id and d.organization_id=v_record.organization_id and d.is_active
  ) then raise exception 'Department is invalid, inactive or outside organization'; end if;

  if v_operation='UPSERT' then
    insert into public.record_department_participants(
      record_id,department_id,participant_role,participation_scope,added_by
    ) values(
      p_record_id,p_department_id,v_role,v_scope,p_actor_user_id
    )
    on conflict(record_id,department_id)
    do update set participant_role=excluded.participant_role,participation_scope=excluded.participation_scope,added_by=excluded.added_by
    returning * into v_participant;

    insert into public.audit_logs(
      actor_user_id,record_id,table_name,row_id,action_type,new_value,request_meta
    ) values(
      p_actor_user_id,p_record_id,'record_department_participants',v_participant.id,
      'UPSERT_RECORD_DEPARTMENT_PARTICIPANT',
      jsonb_build_object(
        'department_id',p_department_id,'participant_role',v_role,
        'participation_scope',v_scope
      ),
      jsonb_build_object('source','qlcl-ui','transaction','qlcl_change_record_department_participant_v1')
    );

    return jsonb_build_object('ok',true,'operation','UPSERT','participant_id',v_participant.id);
  end if;

  delete from public.record_department_participants
  where record_id=p_record_id and department_id=p_department_id and participant_role=v_role
  returning * into v_participant;
  if not found then raise exception 'Participant not found'; end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,old_value,request_meta
  ) values(
    p_actor_user_id,p_record_id,'record_department_participants',v_participant.id,
    'REMOVE_RECORD_DEPARTMENT_PARTICIPANT',
    jsonb_build_object(
      'department_id',v_participant.department_id,
      'participant_role',v_participant.participant_role,
      'participation_scope',v_participant.participation_scope
    ),
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_change_record_department_participant_v1')
  );

  return jsonb_build_object('ok',true,'operation','REMOVE','participant_id',v_participant.id);
end;
$$;

revoke all on function public.qlcl_change_record_department_participant_v1(uuid,uuid,text,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_change_record_department_participant_v1(uuid,uuid,text,uuid,text,text)
  to service_role;

commit;
