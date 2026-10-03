-- "Người phụ trách" (owner_user_id, a single named person) is replaced by
-- "Đơn vị phụ trách" (owner_department_id, a single responsible department) —
-- explicit user decision: accountability for an EMR rollout item should sit
-- with a department, the same way departments already carry responsibility
-- elsewhere in QARICA, not with one named individual (a department already
-- has people in it). This is DISTINCT from department_ids (the item's scope
-- of application, which can be several departments or empty = toàn viện) —
-- owner_department_id is the ONE department accountable for driving it.

alter table public.emr_rollout_items add column if not exists owner_department_id uuid references public.departments(id);

-- Best-effort backfill from each item's previous individual owner's own
-- primary department, so existing assignments aren't silently dropped.
update public.emr_rollout_items ri
set owner_department_id = p.primary_department_id
from public.profiles p
where ri.owner_user_id = p.user_id and ri.owner_department_id is null and p.primary_department_id is not null;

alter table public.emr_rollout_items drop column if exists owner_user_id;
