-- RECONCILIATION: đã áp trực tiếp lên Supabase sống ngày 2026-10-11 07:33, không qua repo.
-- Lần áp đầu tiên của work_foundation_v1 — 32 phút sau được áp lại với nội dung mở rộng
-- hơn (xem 20261011080550_work_foundation_v1.sql), rồi view vw_work_items được định nghĩa
-- lại lần nữa ở 20261011085002_work_read_model_extended_v1.sql. Giữ cả 3 file để khớp
-- đúng lịch sử migration thật trên Supabase (supabase_migrations.schema_migrations).
create table if not exists public.work_followups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('ACTION','EMR','RECORD','OTHER')),
  source_id uuid not null,
  state text not null default 'WAITING' check (state in ('ACTIVE','WAITING','DONE','CANCELLED')),
  waiting_for_type text null check (waiting_for_type is null or waiting_for_type in ('USER','DEPARTMENT','EXTERNAL_PARTY','DOCUMENT','APPROVAL')),
  waiting_for_id uuid null,
  waiting_for_label text null,
  follow_up_at timestamptz null,
  note text null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);
create unique index if not exists work_followups_open_source_owner_uq on public.work_followups(owner_user_id,source_type,source_id) where state in ('ACTIVE','WAITING');
create index if not exists work_followups_owner_state_followup_idx on public.work_followups(owner_user_id,state,follow_up_at);
alter table public.work_followups enable row level security;
drop policy if exists work_followups_owner_select on public.work_followups;
create policy work_followups_owner_select on public.work_followups for select to authenticated using ((select auth.uid())=owner_user_id);
drop policy if exists work_followups_owner_insert on public.work_followups;
create policy work_followups_owner_insert on public.work_followups for insert to authenticated with check ((select auth.uid())=owner_user_id and created_by=(select auth.uid()) and organization_id=private.current_organization_id());
drop policy if exists work_followups_owner_update on public.work_followups;
create policy work_followups_owner_update on public.work_followups for update to authenticated using ((select auth.uid())=owner_user_id) with check ((select auth.uid())=owner_user_id and organization_id=private.current_organization_id());
drop policy if exists work_followups_owner_delete on public.work_followups;
create policy work_followups_owner_delete on public.work_followups for delete to authenticated using ((select auth.uid())=owner_user_id);

create or replace view public.vw_work_items with (security_invoker=true) as
select 'ACTION'::text source_type,a.id source_id,r.id record_id,r.organization_id,a.assignee_user_id owner_user_id,a.lead_department_id owner_department_id,a.title,a.description,a.priority,a.workflow_status source_status,
case when a.workflow_status in ('COMPLETED','CLOSED') then 'DONE' when a.workflow_status in ('CANCELLED','NOT_APPLICABLE') then 'CANCELLED' else 'ACTIVE' end::text normalized_state,
a.start_date::timestamptz start_at,a.due_date::timestamptz due_at,a.actual_end_date::timestamptz completed_at,r.created_at,r.updated_at,('/tasks/'||r.id::text)::text target_route,
jsonb_build_object('assignment_target_type',a.assignment_target_type,'assignee_group_id',a.assignee_group_id,'record_code',r.record_code) metadata
from public.actions a join public.records r on r.id=a.record_id where r.lifecycle_status='ACTIVE'
union all
select 'PERSONAL_REMINDER',pr.id,null::uuid,pr.organization_id,pr.owner_user_id,null::uuid,pr.title,pr.note,pr.priority,pr.status,
case when pr.status='COMPLETED' then 'DONE' when pr.status='CANCELLED' then 'CANCELLED' else 'ACTIVE' end,
null::timestamptz,pr.due_at,pr.completed_at,pr.created_at,pr.updated_at,'/tasks',
jsonb_build_object('category',pr.category,'remind_at',pr.remind_at)
from public.personal_reminders pr
union all
select 'PERSONAL_TASK',pw.id,null::uuid,null::uuid,pw.owner_user_id,null::uuid,pw.title,pw.content,null::text,pw.status,
case when pw.status='COMPLETED' then 'DONE' when pw.status='CANCELLED' then 'CANCELLED' else 'ACTIVE' end,
null::timestamptz,pw.due_at,pw.completed_at,pw.created_at,pw.updated_at,'/me',
jsonb_build_object('item_type',pw.item_type,'category',pw.category)
from public.personal_workspace_items pw where pw.item_type='TASK'
union all
select 'EMR',e.id,null::uuid,e.organization_id,null::uuid,e.owner_department_id,e.title,e.description,e.priority,e.status,
case when e.status='DONE' then 'DONE' when e.status='CANCELLED' then 'CANCELLED' else 'ACTIVE' end,
null::timestamptz,e.due_date::timestamptz,e.verified_at,e.created_at,e.updated_at,'/emr',
jsonb_build_object('category',e.category,'department_ids',e.department_ids,'publish_status',e.publish_status)
from public.emr_rollout_items e where not (e.category='BIEU_MAU' and e.publish_status='DRAFT');
revoke all on public.vw_work_items from anon;
grant select on public.vw_work_items to authenticated;
