create table if not exists public.external_assessment_scores (
 id uuid primary key default gen_random_uuid(),
 external_assessment_event_id uuid not null references public.external_assessment_events(id) on delete cascade,
 criteria_item_id uuid not null references public.criteria_items(id),
 self_score numeric,
 external_score numeric not null,
 note text,
 entered_by uuid references public.profiles(user_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(external_assessment_event_id, criteria_item_id)
);
comment on table public.external_assessment_scores is 'Score comparison only: preserves hospital self-assessment score and stores external authority score for the same criterion. Does not create Finding/CAPA automatically.';
create index if not exists ix_external_assessment_scores_event on public.external_assessment_scores(external_assessment_event_id);
create index if not exists ix_external_assessment_scores_item on public.external_assessment_scores(criteria_item_id);
