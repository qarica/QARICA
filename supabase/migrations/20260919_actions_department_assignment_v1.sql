-- Allow plan materialization to preserve department-owned Actions without inventing a user/group assignee.
do $$
declare
  v_constraint_def text;
begin
  select pg_get_constraintdef(c.oid)
    into v_constraint_def
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'actions'
    and c.conname = 'actions_assignment_target_type_check';

  if v_constraint_def is null
     or position('DEPARTMENT' in upper(v_constraint_def)) = 0 then
    alter table public.actions
      drop constraint if exists actions_assignment_target_type_check;

    alter table public.actions
      add constraint actions_assignment_target_type_check
      check (assignment_target_type = any (array['DEPARTMENT'::text, 'USER'::text, 'GROUP'::text]));
  end if;
end $$;

-- Semantic integrity: department-owned work has no personal/group assignee.
-- Existing USER/GROUP rows remain governed by application/RPC validation.
comment on column public.actions.assignment_target_type is
  'Operational ownership target: DEPARTMENT, USER, or GROUP. Department ownership must not invent a personal assignee.';
