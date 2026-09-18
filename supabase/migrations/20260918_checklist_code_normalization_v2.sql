-- Normalize checklist internal codes after the application supports separate source_code.
-- Preserve every legacy/form code in source_code; only checklist_templates.code is rewritten.
with legacy as (
  select
    t.id,
    t.organization_id,
    extract(year from t.created_at)::integer as code_year,
    row_number() over (
      partition by t.organization_id, extract(year from t.created_at)::integer
      order by t.created_at, t.id
    ) as legacy_seq
  from public.checklist_templates t
  where t.organization_id is not null
    and coalesce(t.code,'') !~ '^BK-[0-9]{4}-[0-9]{4}$'
),
existing_max as (
  select
    t.organization_id,
    substring(t.code from '^BK-([0-9]{4})-')::integer as code_year,
    max(substring(t.code from '-([0-9]{4})$')::integer) as max_seq
  from public.checklist_templates t
  where t.code ~ '^BK-[0-9]{4}-[0-9]{4}$'
  group by t.organization_id, substring(t.code from '^BK-([0-9]{4})-')::integer
),
mapped as (
  select
    l.id,
    'BK-'||l.code_year::text||'-'||lpad((coalesce(e.max_seq,0)+l.legacy_seq)::text,4,'0') as new_code
  from legacy l
  left join existing_max e
    on e.organization_id=l.organization_id and e.code_year=l.code_year
)
update public.checklist_templates t
set
  source_code=coalesce(nullif(trim(t.source_code),''),t.code),
  code=m.new_code,
  code_scheme_version=2,
  updated_at=now()
from mapped m
where t.id=m.id;
