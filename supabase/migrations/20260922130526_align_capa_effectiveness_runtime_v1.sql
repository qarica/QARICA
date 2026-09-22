-- Keep repository schema lineage aligned with Production.
-- Runtime CAPA workflow stores resource requirements and reviewer identity.

alter table public.capas
  add column if not exists required_resources text;

alter table public.capa_effectiveness_reviews
  add column if not exists reviewed_by uuid references auth.users(id);

create index if not exists idx_capa_effectiveness_reviews_reviewed_by
  on public.capa_effectiveness_reviews(reviewed_by);
