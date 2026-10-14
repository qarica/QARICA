-- RECONCILIATION: đã áp trực tiếp lên Supabase sống ngày 2026-10-07, không qua repo.
create table if not exists public.hsba_checklist_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  checklist_version_id uuid not null references public.hsba_checklist_versions(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hsba_checklist_groups_name_check
    check (char_length(btrim(name)) between 1 and 200)
);

create index if not exists hsba_checklist_groups_version_sort_idx
  on public.hsba_checklist_groups(checklist_version_id, sort_order, id);

alter table public.hsba_checklist_items
  add column if not exists group_id uuid
    references public.hsba_checklist_groups(id) on delete set null;

create index if not exists hsba_checklist_items_group_sort_idx
  on public.hsba_checklist_items(group_id, sort_order, id);

alter table public.hsba_audit_item_results
  drop constraint if exists hsba_audit_item_results_result_check;

alter table public.hsba_audit_item_results
  add constraint hsba_audit_item_results_result_check
  check (result = any (array[
    'PASS'::text,
    'PARTIAL'::text,
    'FAIL'::text,
    'NA'::text
  ]));

alter table public.hsba_checklist_groups enable row level security;

drop policy if exists qlcl_authenticated_select on public.hsba_checklist_groups;
create policy qlcl_authenticated_select
on public.hsba_checklist_groups
for select
to authenticated
using (organization_id = private.current_organization_id());

comment on table public.hsba_checklist_groups is
  'Nhóm lớn của bảng kiểm nội bộ; mỗi nhóm thuộc một phiên bản bảng kiểm để bảo toàn lịch sử khi chỉnh sửa/phát hành phiên bản mới.';

comment on column public.hsba_checklist_items.group_id is
  'Nhóm lớn chứa tiêu chí; nullable để tương thích các bảng kiểm cũ chưa phân nhóm.';

comment on column public.hsba_audit_item_results.result is
  'Kết quả chấm tiêu chí: PASS=Đạt, PARTIAL=Đạt một phần, FAIL=Không đạt, NA=Không áp dụng.';
