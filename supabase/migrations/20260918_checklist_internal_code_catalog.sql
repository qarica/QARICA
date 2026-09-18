-- Keep the source form code used by existing workflows and assign a stable
-- QARICA catalog code without rewriting referenced identifiers.
alter table public.checklist_templates add column if not exists internal_code text;

with numbered as (
  select id, extract(year from created_at)::int as code_year,
         row_number() over (partition by organization_id, extract(year from created_at)::int order by created_at, id) as seq
  from public.checklist_templates
  where internal_code is null
)
update public.checklist_templates t
set internal_code = 'BK-' || n.code_year || '-' || lpad(n.seq::text, 4, '0'),
    source_code = coalesce(t.source_code, t.code)
from numbered n where t.id = n.id;

create unique index if not exists uq_checklist_internal_code_per_org
on public.checklist_templates (organization_id, internal_code)
where internal_code is not null;
