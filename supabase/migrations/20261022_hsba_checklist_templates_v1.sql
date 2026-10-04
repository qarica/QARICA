-- Audit HSBA: nhiều mẫu bảng kiểm khác nhau cho mỗi loại audit (HSBA/Phác đồ
-- điều trị/QTKT nội trú), thay vì 1 danh sách tiêu chí phẳng dùng chung cho
-- mọi lượt kiểm tra — mô phỏng đúng kiến trúc Template → Phiên bản (Nháp/Đã
-- phát hành) → Tiêu chí đã dùng ở module Giám sát (checklist_templates/
-- checklist_versions), chỉ bỏ sections/answer_type/scoring vì Audit HSBA vẫn
-- là bảng kiểm PASS/FAIL đơn giản, không cần mức độ phức tạp đó.
--
-- Một lượt kiểm tra (hsba_audits) ghim vào đúng phiên bản đã dùng
-- (checklist_version_id), nên sửa mẫu sau này không làm thay đổi ngược các
-- lượt kiểm tra lịch sử — cùng nguyên tắc monitoring_rounds.checklist_version_id.

create table if not exists public.hsba_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  audit_type text not null check (audit_type in ('HSBA','PHAC_DO_DIEU_TRI','QTKT_NOI_TRU')),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  description text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hsba_checklist_templates_org_type_idx
  on public.hsba_checklist_templates(organization_id, audit_type, is_active);

create table if not exists public.hsba_checklist_versions (
  id uuid primary key default gen_random_uuid(),
  checklist_template_id uuid not null references public.hsba_checklist_templates(id) on delete cascade,
  version_no int not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','RETIRED')),
  published_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(checklist_template_id, version_no)
);

create index if not exists hsba_checklist_versions_template_idx
  on public.hsba_checklist_versions(checklist_template_id, status);

alter table public.hsba_checklist_items
  add column if not exists checklist_version_id uuid references public.hsba_checklist_versions(id);

create index if not exists hsba_checklist_items_version_idx
  on public.hsba_checklist_items(checklist_version_id, is_active, sort_order);

alter table public.hsba_audits
  add column if not exists checklist_version_id uuid references public.hsba_checklist_versions(id);

-- Backfill: mỗi (organization_id, audit_type) đang có sẵn tiêu chí trở thành
-- 1 mẫu "Bảng kiểm mặc định" + 1 phiên bản v1 Đã phát hành, để dữ liệu và
-- lượt kiểm tra cũ tiếp tục hoạt động không cần thao tác gì thêm.
do $$
declare
  r record;
  v_template_id uuid;
  v_version_id uuid;
  v_creator uuid;
begin
  for r in
    select distinct organization_id, audit_type
    from public.hsba_checklist_items
    where checklist_version_id is null
  loop
    select user_id into v_creator from public.profiles
      where organization_id = r.organization_id and is_active = true
      order by created_at limit 1;
    if v_creator is null then
      continue;
    end if;

    insert into public.hsba_checklist_templates(organization_id, audit_type, name, created_by)
    values (r.organization_id, r.audit_type, 'Bảng kiểm mặc định', v_creator)
    returning id into v_template_id;

    insert into public.hsba_checklist_versions(checklist_template_id, version_no, status, published_at, created_by)
    values (v_template_id, 1, 'PUBLISHED', now(), v_creator)
    returning id into v_version_id;

    update public.hsba_checklist_items
      set checklist_version_id = v_version_id
      where organization_id = r.organization_id and audit_type = r.audit_type and checklist_version_id is null;

    update public.hsba_audits
      set checklist_version_id = v_version_id
      where organization_id = r.organization_id and audit_type = r.audit_type and checklist_version_id is null;
  end loop;
end $$;

alter table public.hsba_checklist_templates enable row level security;
alter table public.hsba_checklist_versions enable row level security;

drop policy if exists qlcl_authenticated_select on public.hsba_checklist_templates;
create policy qlcl_authenticated_select on public.hsba_checklist_templates
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

drop policy if exists qlcl_authenticated_select on public.hsba_checklist_versions;
create policy qlcl_authenticated_select on public.hsba_checklist_versions
for select to authenticated
using (exists (
  select 1 from public.hsba_checklist_templates t
  where t.id = hsba_checklist_versions.checklist_template_id
    and t.organization_id = (select organization_id from public.profiles where user_id = auth.uid())
));

-- Tạo mẫu mới + phiên bản Nháp đầu tiên, atomic.
create or replace function public.qlcl_create_hsba_checklist_template_v1(
  p_actor_user_id uuid,
  p_audit_type text,
  p_name text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_audit_type text := upper(trim(coalesce(p_audit_type,'')));
  v_name text := trim(coalesce(p_name,''));
  v_template_id uuid;
  v_version_id uuid;
  v_now timestamptz := now();
begin
  if p_actor_user_id is null then
    raise exception 'Thiếu người tạo mẫu';
  end if;
  if v_audit_type not in ('HSBA','PHAC_DO_DIEU_TRI','QTKT_NOI_TRU') then
    raise exception 'Loại audit không hợp lệ';
  end if;
  if v_name = '' then
    raise exception 'Tên mẫu bảng kiểm là bắt buộc';
  end if;

  select organization_id into v_org
  from public.profiles
  where user_id = p_actor_user_id and is_active = true;

  if v_org is null then
    raise exception 'Tài khoản không hợp lệ hoặc chưa gắn tổ chức';
  end if;

  insert into public.hsba_checklist_templates(organization_id, audit_type, name, description, created_by)
  values (v_org, v_audit_type, v_name, nullif(trim(coalesce(p_description,'')),''), p_actor_user_id)
  returning id into v_template_id;

  insert into public.hsba_checklist_versions(checklist_template_id, version_no, status, created_by)
  values (v_template_id, 1, 'DRAFT', p_actor_user_id)
  returning id into v_version_id;

  insert into public.audit_logs(actor_user_id, table_name, row_id, action_type, new_value, reason, request_meta)
  values (
    p_actor_user_id, 'hsba_checklist_templates', v_template_id, 'HSBA_CHECKLIST_TEMPLATE_CREATE',
    jsonb_build_object('audit_type', v_audit_type, 'name', v_name, 'version_id', v_version_id, 'version_no', 1),
    'Tạo mẫu bảng kiểm HSBA và phiên bản Nháp đầu tiên.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_create_hsba_checklist_template_v1')
  );

  return jsonb_build_object('ok',true,'id',v_template_id,'name',v_name,'audit_type',v_audit_type,'version_id',v_version_id,'version_no',1,'status','DRAFT');
end;
$function$;

revoke all on function public.qlcl_create_hsba_checklist_template_v1(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_create_hsba_checklist_template_v1(uuid,text,text,text)
  to service_role;

-- Tạo phiên bản Nháp mới (clone từ phiên bản gần nhất), atomic. Nếu đã có
-- sẵn 1 Nháp thì trả về chính nó thay vì tạo trùng.
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
  v_new_version_id uuid;
  v_version_no integer;
  v_item_count integer := 0;
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
    return jsonb_build_object('ok',true,'existing',true,'version_id',v_existing.id,'version_no',v_existing.version_no,'item_count',0);
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

  insert into public.hsba_checklist_items(organization_id, audit_type, checklist_version_id, content, category, sort_order, is_active)
  select v_template.organization_id, v_template.audit_type, v_new_version_id, content, category, sort_order, is_active
  from public.hsba_checklist_items
  where checklist_version_id = v_source.id
  order by sort_order, id;

  get diagnostics v_item_count = row_count;

  insert into public.audit_logs(actor_user_id, table_name, row_id, action_type, new_value, reason, request_meta)
  values (
    p_actor_user_id, 'hsba_checklist_versions', v_new_version_id, 'HSBA_CHECKLIST_VERSION_CREATE',
    jsonb_build_object('template_id', p_template_id, 'source_version_id', v_source.id, 'version_no', v_version_no, 'item_count', v_item_count),
    'Tạo phiên bản Nháp mới từ phiên bản gần nhất.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_clone_hsba_checklist_version_v1')
  );

  return jsonb_build_object('ok',true,'existing',false,'version_id',v_new_version_id,'version_no',v_version_no,'item_count',v_item_count);
end;
$function$;

revoke all on function public.qlcl_clone_hsba_checklist_version_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.qlcl_clone_hsba_checklist_version_v1(uuid,uuid)
  to service_role;

-- Phát hành phiên bản Nháp (yêu cầu >=1 tiêu chí đang dùng), atomic. Phát
-- hành phiên bản mới sẽ tự chuyển phiên bản Đã phát hành trước đó của cùng
-- mẫu sang Ngừng dùng — chỉ 1 phiên bản đang hiệu lực tại một thời điểm.
create or replace function public.qlcl_publish_hsba_checklist_version_v1(
  p_template_id uuid,
  p_version_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_template public.hsba_checklist_templates%rowtype;
  v_version public.hsba_checklist_versions%rowtype;
  v_item_count integer;
  v_now timestamptz := now();
begin
  if p_template_id is null or p_version_id is null or p_actor_user_id is null then
    raise exception 'Thiếu thông tin phát hành';
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

  select * into v_version
  from public.hsba_checklist_versions
  where id = p_version_id and checklist_template_id = p_template_id
  for update;

  if not found then raise exception 'Không tìm thấy phiên bản bảng kiểm'; end if;
  if v_version.status <> 'DRAFT' then
    raise exception 'Chỉ phát hành được phiên bản đang ở trạng thái Nháp';
  end if;

  select count(*) into v_item_count
  from public.hsba_checklist_items
  where checklist_version_id = p_version_id and is_active = true;

  if v_item_count < 1 then
    raise exception 'Phiên bản cần ít nhất 1 tiêu chí đang dùng trước khi phát hành';
  end if;

  update public.hsba_checklist_versions
  set status = 'RETIRED'
  where checklist_template_id = p_template_id
    and status = 'PUBLISHED'
    and id <> p_version_id;

  update public.hsba_checklist_versions
  set status = 'PUBLISHED', published_at = v_now
  where id = p_version_id and status = 'DRAFT';

  if not found then raise exception 'Phát hành phiên bản bị trùng thao tác, thử lại'; end if;

  insert into public.audit_logs(actor_user_id, table_name, row_id, action_type, new_value, reason, request_meta)
  values (
    p_actor_user_id, 'hsba_checklist_versions', p_version_id, 'HSBA_CHECKLIST_VERSION_PUBLISH',
    jsonb_build_object('template_id', p_template_id, 'version_no', v_version.version_no, 'item_count', v_item_count),
    'Phát hành phiên bản bảng kiểm HSBA.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_publish_hsba_checklist_version_v1')
  );

  return jsonb_build_object('ok',true,'version_id',p_version_id,'status','PUBLISHED','published_at',v_now);
end;
$function$;

revoke all on function public.qlcl_publish_hsba_checklist_version_v1(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.qlcl_publish_hsba_checklist_version_v1(uuid,uuid,uuid)
  to service_role;
