-- Keep all assessment-round criterion writers compatible with the canonical
-- criteria_item_id linkage introduced by assessment_round_criteria_linkage_v1.
-- Both the old criterion_id writer and the canonical criteria_item_id writer are
-- accepted, but the two values may never diverge.

create or replace function public.qlcl_sync_assessment_round_criterion_link_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_item_id uuid;
  v_version_id uuid;
begin
  if new.criteria_item_id is not null
     and new.criterion_id is not null
     and new.criteria_item_id is distinct from new.criterion_id then
    raise exception 'Legacy and canonical criterion linkage must match';
  end if;

  v_item_id := coalesce(new.criteria_item_id, new.criterion_id);
  if v_item_id is null then
    raise exception 'Assessment round criterion requires a criteria item';
  end if;

  select ar.criteria_version_id
    into v_version_id
  from public.assessment_rounds ar
  where ar.id = new.assessment_round_id;

  if v_version_id is null then
    raise exception 'Assessment round does not have a criteria version';
  end if;

  if not exists (
    select 1
    from public.criteria_items ci
    where ci.id = v_item_id
      and ci.criteria_version_id = v_version_id
  ) then
    raise exception 'Criterion is outside the assessment round criteria version';
  end if;

  new.criteria_item_id := v_item_id;
  new.criterion_id := v_item_id;
  return new;
end;
$function$;

revoke all on function public.qlcl_sync_assessment_round_criterion_link_v1()
  from public, anon, authenticated;

drop trigger if exists trg_assessment_round_criterion_link_v1
  on public.assessment_round_criteria;

create trigger trg_assessment_round_criterion_link_v1
before insert or update of assessment_round_id, criteria_item_id, criterion_id
on public.assessment_round_criteria
for each row
execute function public.qlcl_sync_assessment_round_criterion_link_v1();
