-- Repository lineage for Production schema already applied on 2026-09-22.
-- Idempotent: preserves current runtime behavior and indicator target-range columns.

CREATE OR REPLACE FUNCTION public.qlcl_ensure_department_action_execution_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.assignment_target_type='DEPARTMENT' and new.lead_department_id is not null then
    insert into public.action_department_executions(action_id,department_id,workflow_status,due_date)
    select new.id,new.lead_department_id,
      case when new.workflow_status='IN_PROGRESS' then 'IN_PROGRESS' else 'NOT_STARTED' end,
      new.due_date
    where not exists (
      select 1 from public.action_department_executions e
      where e.action_id=new.id and e.department_id=new.lead_department_id
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_qlcl_ensure_department_action_execution_v1 on public.actions;
create trigger trg_qlcl_ensure_department_action_execution_v1
after insert or update of assignment_target_type, lead_department_id on public.actions
for each row execute function public.qlcl_ensure_department_action_execution_v1();

alter table public.indicator_assignments add column if not exists target_lower numeric;
alter table public.indicator_assignments add column if not exists target_upper numeric;
