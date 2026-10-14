-- RECONCILIATION: đã áp trực tiếp lên Supabase sống ngày 2026-10-11 07:33, không qua repo.
-- Lần áp đầu tiên — 32 phút sau được áp lại với nội dung khác (xem
-- 20261011080605_knowledge_journal_foundation_v1.sql). Giữ cả 2 file để khớp đúng
-- lịch sử migration thật trên Supabase.
create table if not exists public.knowledge_notes (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 organization_id uuid null references public.organizations(id) on delete cascade,
 note_type text not null default 'NOTE' check (note_type in ('NOTE','JOURNAL','DECISION','LESSON','REFERENCE')),
 visibility text not null default 'PRIVATE' check (visibility in ('PRIVATE','TEAM','LINKED_RECORD')),
 title text not null check (char_length(btrim(title)) between 1 and 300),
 content text null,
 journal_date date null,
 status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
 source_kind text not null default 'USER' check (source_kind in ('USER','AI_DRAFT','IMPORT')),
 source_ref text null,
 generated_at timestamptz null,
 ai_model text null,
 ai_confidence numeric null check (ai_confidence is null or (ai_confidence>=0 and ai_confidence<=1)),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz null,
 search_document tsvector generated always as (setweight(to_tsvector('simple',coalesce(title,'')),'A') || setweight(to_tsvector('simple',coalesce(content,'')),'B')) stored,
 check ((visibility='PRIVATE' and organization_id is null) or (visibility in ('TEAM','LINKED_RECORD') and organization_id is not null))
);
create table if not exists public.knowledge_links (
 id uuid primary key default gen_random_uuid(),
 note_id uuid not null references public.knowledge_notes(id) on delete cascade,
 relation_type text not null default 'RELATED_TO' check (relation_type in ('RELATED_TO','ABOUT','SUPPORTS','DECISION_FOR','LESSON_FROM','MENTIONS')),
 target_type text not null,
 target_id uuid not null,
 target_label text null,
 source_context text null,
 needs_confirmation boolean not null default false,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(note_id,relation_type,target_type,target_id)
);
create table if not exists public.knowledge_aliases (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 organization_id uuid null references public.organizations(id) on delete cascade,
 canonical_type text not null,
 canonical_id uuid not null,
 alias text not null check (char_length(btrim(alias)) between 1 and 200),
 created_at timestamptz not null default now(),
 unique(owner_user_id,canonical_type,canonical_id,alias)
);
create index if not exists knowledge_notes_owner_status_created_idx on public.knowledge_notes(owner_user_id,status,created_at desc);
create index if not exists knowledge_notes_org_visibility_status_idx on public.knowledge_notes(organization_id,visibility,status,created_at desc);
create index if not exists knowledge_notes_search_idx on public.knowledge_notes using gin(search_document);
create index if not exists knowledge_links_target_idx on public.knowledge_links(target_type,target_id);
alter table public.knowledge_notes enable row level security;
alter table public.knowledge_links enable row level security;
alter table public.knowledge_aliases enable row level security;
drop policy if exists knowledge_notes_select on public.knowledge_notes;
create policy knowledge_notes_select on public.knowledge_notes for select to authenticated using (owner_user_id=(select auth.uid()) or (visibility='TEAM' and organization_id=private.current_organization_id()));
drop policy if exists knowledge_notes_insert on public.knowledge_notes;
create policy knowledge_notes_insert on public.knowledge_notes for insert to authenticated with check (owner_user_id=(select auth.uid()) and ((visibility='PRIVATE' and organization_id is null) or (visibility in ('TEAM','LINKED_RECORD') and organization_id=private.current_organization_id())));
drop policy if exists knowledge_notes_update on public.knowledge_notes;
create policy knowledge_notes_update on public.knowledge_notes for update to authenticated using (owner_user_id=(select auth.uid())) with check (owner_user_id=(select auth.uid()) and ((visibility='PRIVATE' and organization_id is null) or (visibility in ('TEAM','LINKED_RECORD') and organization_id=private.current_organization_id())));
drop policy if exists knowledge_notes_delete on public.knowledge_notes;
create policy knowledge_notes_delete on public.knowledge_notes for delete to authenticated using (owner_user_id=(select auth.uid()));
drop policy if exists knowledge_links_select on public.knowledge_links;
create policy knowledge_links_select on public.knowledge_links for select to authenticated using (exists(select 1 from public.knowledge_notes n where n.id=knowledge_links.note_id and (n.owner_user_id=(select auth.uid()) or (n.visibility='TEAM' and n.organization_id=private.current_organization_id()))));
drop policy if exists knowledge_links_insert on public.knowledge_links;
create policy knowledge_links_insert on public.knowledge_links for insert to authenticated with check (created_by=(select auth.uid()) and exists(select 1 from public.knowledge_notes n where n.id=knowledge_links.note_id and n.owner_user_id=(select auth.uid())));
drop policy if exists knowledge_links_update on public.knowledge_links;
create policy knowledge_links_update on public.knowledge_links for update to authenticated using (exists(select 1 from public.knowledge_notes n where n.id=knowledge_links.note_id and n.owner_user_id=(select auth.uid()))) with check (created_by=(select auth.uid()));
drop policy if exists knowledge_links_delete on public.knowledge_links;
create policy knowledge_links_delete on public.knowledge_links for delete to authenticated using (exists(select 1 from public.knowledge_notes n where n.id=knowledge_links.note_id and n.owner_user_id=(select auth.uid())));
drop policy if exists knowledge_aliases_owner_all on public.knowledge_aliases;
create policy knowledge_aliases_owner_all on public.knowledge_aliases for all to authenticated using (owner_user_id=(select auth.uid())) with check (owner_user_id=(select auth.uid()));
