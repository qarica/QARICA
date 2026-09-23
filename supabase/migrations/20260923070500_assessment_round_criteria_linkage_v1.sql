-- Canonicalize legacy assessment round linkage without changing assessment history.
update public.assessment_round_criteria arc
set criteria_item_id = arc.criterion_id
from public.assessment_rounds ar,
     public.criteria_items ci
where ar.id = arc.assessment_round_id
  and ci.id = arc.criterion_id
  and ci.criteria_version_id = ar.criteria_version_id
  and arc.criteria_item_id is null;

-- Prevent future split linkage: canonical column is required for every round criterion.
alter table public.assessment_round_criteria
  alter column criteria_item_id set not null;
