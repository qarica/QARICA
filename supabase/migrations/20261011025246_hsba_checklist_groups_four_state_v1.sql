-- RECONCILIATION: đã áp trực tiếp lên Supabase sống ngày 2026-10-11, không qua repo.
-- Checklist groups + four-state HSBA audit foundation.
-- Safe/idempotent: preserve source-of-truth and published-version history.

create table if not exists public.hsba_checklist_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  checklist_version_id uuid not null references public.hsba_checklist_versions(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hsba_checklist_items
  add column if not exists group_id uuid references public.hsba_checklist_groups(id) on delete set null;

alter table public.hsba_checklist_items
  add column if not exists create_finding_on_partial boolean not null default false;

create index if not exists hsba_checklist_groups_version_idx
  on public.hsba_checklist_groups(checklist_version_id, is_active, sort_order);

create index if not exists hsba_checklist_items_group_idx
  on public.hsba_checklist_items(group_id, sort_order);

alter table public.hsba_checklist_groups enable row level security;

drop policy if exists qlcl_authenticated_select on public.hsba_checklist_groups;
create policy qlcl_authenticated_select on public.hsba_checklist_groups
for select to authenticated
using (
  organization_id = (
    select organization_id from public.profiles where user_id = auth.uid()
  )
);

alter table public.hsba_audit_item_results
  drop constraint if exists hsba_audit_item_results_result_check;
alter table public.hsba_audit_item_results
  add constraint hsba_audit_item_results_result_check
  check (result in ('PASS','PARTIAL','FAIL','NA'));

alter table public.hsba_audits
  drop constraint if exists hsba_audits_overall_result_check;
alter table public.hsba_audits
  add constraint hsba_audits_overall_result_check
  check (overall_result in ('PENDING','PASS','PARTIAL','FAIL'));

create or replace function public.qlcl_clone_hsba_checklist_version_v1(
  p_template_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_template public.hsba_checklist_templates%rowtype;
  v_existing public.hsba_checklist_versions%rowtype;
  v_source public.hsba_checklist_versions%rowtype;
  v_group public.hsba_checklist_groups%rowtype;
  v_new_version_id uuid;
  v_new_group_id uuid;
  v_version_no integer;
  v_item_count integer := 0;
  v_rows integer := 0;
begin
  if p_template_id is null or p_actor_user_id is null then
    raise exception 'Thiếu mẫu bảng kiểm hoặc người thao tác';
  end if;

  select t.* into v_template
  from public.hsba_checklist_templates t
  join public.profiles p on p.organization_id = t.organization_id
  where t.id = p_template_id
    and p.user_id = p_actor_user_id
    and p.is_active = true
  for update of t;

  if not found then
    raise exception 'Không tìm thấy mẫu bảng kiểm hoặc ngoài phạm vi tổ chức';
  end if;
  if not v_template.is_active then
    raise exception 'Mẫu bảng kiểm đã ngưng sử dụng';
  end if;

  select * into v_existing
  from public.hsba_checklist_versions
  where checklist_template_id = p_template_id and status = 'DRAFT'
  order by version_no desc
  limit 1;

  if found then
    select count(*) into v_item_count
    from public.hsba_checklist_items
    where checklist_version_id = v_existing.id;
    return jsonb_build_object('ok',true,'existing',true,'version_id',v_existing.id,'version_no',v_existing.version_no,'item_count',v_item_count);
  end if;

  select * into v_source
  from public.hsba_checklist_versions
  where checklist_template_id = p_template_id
  order by version_no desc
  limit 1
  for update;

  if not found then
    raise exception 'Mẫu bảng kiểm chưa có phiên bản nguồn';
  end if;

  select coalesce(max(version_no),0) + 1 into v_version_no
  from public.hsba_checklist_versions
  where checklist_template_id = p_template_id;

  insert into public.hsba_checklist_versions(checklist_template_id, version_no, status, created_by)
  values (p_template_id, v_version_no, 'DRAFT', p_actor_user_id)
  returning id into v_new_version_id;

  for v_group in
    select *
    from public.hsba_checklist_groups
    where checklist_version_id = v_source.id
    order by sort_order, id
  loop
    insert into public.hsba_checklist_groups(
      organization_id, checklist_version_id, name, sort_order, is_active
    )
    values (
      v_template.organization_id, v_new_version_id, v_group.name, v_group.sort_order, v_group.is_active
    )
    returning id into v_new_group_id;

    insert into public.hsba_checklist_items(
      organization_id, audit_type, checklist_version_id, group_id,
      content, category, sort_order, is_active, create_finding_on_partial
    )
    select
      v_template.organization_id, v_template.audit_type, v_new_version_id, v_new_group_id,
      content, category, sort_order, is_active, create_finding_on_partial
    from public.hsba_checklist_items
    where checklist_version_id = v_source.id and group_id = v_group.id
    order by sort_order, id;

    get diagnostics v_rows = row_count;
    v_item_count := v_item_count + v_rows;
  end loop;

  insert into public.hsba_checklist_items(
    organization_id, audit_type, checklist_version_id, group_id,
    content, category, sort_order, is_active, create_finding_on_partial
  )
  select
    v_template.organization_id, v_template.audit_type, v_new_version_id, null,
    content, category, sort_order, is_active, create_finding_on_partial
  from public.hsba_checklist_items
  where checklist_version_id = v_source.id and group_id is null
  order by sort_order, id;

  get diagnostics v_rows = row_count;
  v_item_count := v_item_count + v_rows;

  insert into public.audit_logs(actor_user_id, table_name, row_id, action_type, new_value, reason, request_meta)
  values (
    p_actor_user_id, 'hsba_checklist_versions', v_new_version_id, 'HSBA_CHECKLIST_VERSION_CREATE',
    jsonb_build_object('template_id', p_template_id, 'source_version_id', v_source.id, 'version_no', v_version_no, 'item_count', v_item_count),
    'Tạo phiên bản Nháp mới từ phiên bản gần nhất, giữ nguyên cấu trúc nhóm.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_clone_hsba_checklist_version_v1')
  );

  return jsonb_build_object('ok',true,'existing',false,'version_id',v_new_version_id,'version_no',v_version_no,'item_count',v_item_count);
end;
$function$;

revoke all on function public.qlcl_clone_hsba_checklist_version_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.qlcl_clone_hsba_checklist_version_v1(uuid,uuid)
  to service_role;
