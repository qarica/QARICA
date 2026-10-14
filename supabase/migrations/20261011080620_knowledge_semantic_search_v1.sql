-- RECONCILIATION: đã áp trực tiếp lên Supabase sống ngày 2026-10-11 08:06, không qua repo.
-- Áp lại 32 phút sau 20261011073356_knowledge_semantic_search_v1.sql (nội dung tương đương).
create extension if not exists vector with schema extensions;
create table if not exists public.knowledge_embeddings (
  note_id uuid primary key references public.knowledge_notes(id) on delete cascade,
  embedding extensions.vector not null,
  provider text not null,
  model text not null,
  dimensions integer not null check (dimensions > 0),
  content_hash text not null,
  embedded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.knowledge_embeddings enable row level security;
revoke all on public.knowledge_embeddings from anon, authenticated;
create or replace function public.qlcl_match_knowledge_embeddings_v1(
  p_query_embedding extensions.vector,
  p_note_ids uuid[],
  p_limit integer default 10
)
returns table(note_id uuid, similarity double precision)
language sql stable security definer set search_path to ''
as $function$
  select e.note_id,
         (1 - (e.embedding OPERATOR(extensions.<=>) p_query_embedding))::double precision as similarity
  from public.knowledge_embeddings e
  where e.note_id = any(coalesce(p_note_ids, '{}'::uuid[]))
  order by e.embedding OPERATOR(extensions.<=>) p_query_embedding
  limit greatest(1, least(coalesce(p_limit,10),50));
$function$;
revoke all on function public.qlcl_match_knowledge_embeddings_v1(extensions.vector,uuid[],integer) from public,anon,authenticated;
grant execute on function public.qlcl_match_knowledge_embeddings_v1(extensions.vector,uuid[],integer) to service_role;
