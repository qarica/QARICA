-- Requirement: self-assessment no longer requires an owning department at the round
-- ("đợt tự đánh giá") level, since no single department owns every criterion in a set.
-- Instead, each criterion/sub-item ("tiêu chí") must declare its own owning department.
-- Adds the column and threads it through the existing atomic create/revision RPCs
-- (20260924162500_criteria_management_atomic_audit_v1.sql) without altering their
-- existing parameter order, so this ships as a pure addition.

alter table public.criteria_items
  add column if not exists owner_department_id uuid references public.departments(id);

create index if not exists idx_criteria_items_owner_department on public.criteria_items(owner_department_id);

-- CREATE OR REPLACE cannot change a function's parameter list (adding one makes it a
-- distinct overload in Postgres, identified by name+parameter types); drop the old
-- 14-parameter signature explicitly so it doesn't linger as a dormant bypass of the new
-- mandatory-department check.
drop function if exists public.qlcl_create_criteria_item_v1(uuid,uuid,text,text,text,uuid,text,integer,text,text,integer,boolean,boolean,numeric);

create or replace function public.qlcl_create_criteria_item_v1(
  p_actor_user_id uuid,
  p_criteria_set_id uuid,
  p_title text,
  p_code text,
  p_description text,
  p_parent_criteria_item_id uuid,
  p_requested_item_type text,
  p_sequence_no integer,
  p_chapter_code text,
  p_chapter_name text,
  p_score_weight integer,
  p_is_core boolean,
  p_is_mandatory boolean,
  p_max_score numeric,
  p_owner_department_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor public.profiles%rowtype;
  v_set public.criteria_sets%rowtype;
  v_version public.criteria_set_versions%rowtype;
  v_parent public.criteria_items%rowtype;
  v_department public.departments%rowtype;
  v_title text := trim(coalesce(p_title,''));
  v_code text := nullif(upper(trim(coalesce(p_code,''))),'');
  v_item_type text;
  v_sequence integer;
  v_item_id uuid;
  v_now timestamptz := now();
begin
  select * into v_actor
  from public.profiles
  where user_id=p_actor_user_id and is_active=true;

  if not found or v_actor.organization_id is null then
    raise exception 'Tài khoản không hợp lệ hoặc chưa gắn tổ chức.';
  end if;
  if v_title='' then raise exception 'Tên tiêu chí/tiểu mục là bắt buộc.'; end if;
  if p_owner_department_id is null then raise exception 'Khoa/phòng phụ trách tiêu chí là bắt buộc.'; end if;

  select * into v_department
  from public.departments
  where id=p_owner_department_id
    and organization_id=v_actor.organization_id
    and is_active=true;
  if not found then raise exception 'Khoa/phòng phụ trách không hợp lệ.'; end if;

  select * into v_set
  from public.criteria_sets
  where id=p_criteria_set_id
    and organization_id=v_actor.organization_id
  for update;

  if not found then raise exception 'Không tìm thấy bộ tiêu chí trong tổ chức hiện tại.'; end if;
  if not v_set.is_active then raise exception 'Bộ tiêu chí đã ngưng áp dụng.'; end if;

  select * into v_version
  from public.criteria_set_versions
  where criteria_set_id=v_set.id and status='DRAFT'
  order by version_no desc
  limit 1
  for update;

  if not found then
    raise exception 'Bộ tiêu chí chưa có phiên bản Nháp để chỉnh sửa.';
  end if;

  if p_parent_criteria_item_id is not null then
    select * into v_parent
    from public.criteria_items
    where id=p_parent_criteria_item_id
    for update;
    if not found
       or v_parent.criteria_version_id<>v_version.id
       or v_parent.parent_criteria_item_id is not null then
      raise exception 'Tiêu chí cha không hợp lệ; tiểu mục chỉ được nằm dưới một tiêu chí cấp 1.';
    end if;
    if not v_parent.is_active then raise exception 'Tiêu chí cha đã ngưng áp dụng.'; end if;
    v_item_type:='SUBITEM';
  else
    v_item_type:=case
      when upper(trim(coalesce(p_requested_item_type,''))) in ('CRITERION','GROUP')
        then upper(trim(p_requested_item_type))
      else 'CRITERION'
    end;
  end if;

  if v_code is not null and exists (
    select 1 from public.criteria_items
    where criteria_version_id=v_version.id
      and upper(trim(coalesce(code,'')))=upper(trim(v_code))
  ) then
    raise exception 'Mã tiêu chí đã tồn tại trong phiên bản này.';
  end if;

  if coalesce(p_sequence_no,0)>0 then
    v_sequence:=p_sequence_no;
  else
    select coalesce(max(sequence_no),0)+10 into v_sequence
    from public.criteria_items
    where criteria_version_id=v_version.id
      and parent_criteria_item_id is not distinct from p_parent_criteria_item_id;
  end if;

  insert into public.criteria_items(
    criteria_version_id,code,title,description,sequence_no,
    chapter_code,chapter_name,score_weight,is_core,is_mandatory,max_score,
    parent_criteria_item_id,item_type,owner_department_id,is_active,created_at,updated_at
  ) values (
    v_version.id,v_code,v_title,nullif(trim(coalesce(p_description,'')),''),
    v_sequence,nullif(trim(coalesce(p_chapter_code,'')),''),
    nullif(trim(coalesce(p_chapter_name,'')),''),
    greatest(1,coalesce(p_score_weight,1)),
    coalesce(p_is_core,false),coalesce(p_is_mandatory,false),p_max_score,
    p_parent_criteria_item_id,v_item_type,p_owner_department_id,true,v_now,v_now
  )
  returning id into v_item_id;

  insert into public.audit_logs(
    actor_user_id,table_name,row_id,action_type,new_value,reason,request_meta
  ) values (
    p_actor_user_id,'criteria_items',v_item_id,'CRITERIA_ITEM_CREATE',
    jsonb_build_object(
      'criteria_set_id',v_set.id,'criteria_version_id',v_version.id,
      'version_no',v_version.version_no,'code',v_code,'title',v_title,
      'parent_criteria_item_id',p_parent_criteria_item_id,
      'item_type',v_item_type,'sequence_no',v_sequence,
      'owner_department_id',p_owner_department_id
    ),
    'Tạo tiêu chí/tiểu mục trong phiên bản Nháp.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_create_criteria_item_v1')
  );

  return jsonb_build_object(
    'ok',true,'id',v_item_id,'code',v_code,'title',v_title,
    'parent_criteria_item_id',p_parent_criteria_item_id,
    'item_type',v_item_type,'sequence_no',v_sequence,
    'owner_department_id',p_owner_department_id,
    'criteria_version_id',v_version.id,'version_no',v_version.version_no
  );
end;
$function$;

-- Carry owner_department_id over when cloning items into a new draft revision, otherwise
-- every revision would silently lose department ownership on its items.
create or replace function public.qlcl_create_criteria_revision_v1(
  p_actor_user_id uuid,
  p_criteria_set_id uuid,
  p_effective_from date
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor public.profiles%rowtype;
  v_set public.criteria_sets%rowtype;
  v_existing public.criteria_set_versions%rowtype;
  v_source public.criteria_set_versions%rowtype;
  v_new_version_id uuid;
  v_new_version_no integer;
  v_item record;
  v_new_item_id uuid;
  v_id_map jsonb := '{}'::jsonb;
  v_cloned integer := 0;
  v_now timestamptz := now();
begin
  select * into v_actor
  from public.profiles
  where user_id=p_actor_user_id and is_active=true;

  if not found or v_actor.organization_id is null then
    raise exception 'Tài khoản không hợp lệ hoặc chưa gắn tổ chức.';
  end if;

  select * into v_set
  from public.criteria_sets
  where id=p_criteria_set_id
    and organization_id=v_actor.organization_id
  for update;

  if not found then raise exception 'Không tìm thấy bộ tiêu chí trong tổ chức hiện tại.'; end if;
  if not v_set.is_active then raise exception 'Bộ tiêu chí đã ngưng áp dụng.'; end if;

  select * into v_existing
  from public.criteria_set_versions
  where criteria_set_id=v_set.id and status='DRAFT'
  order by version_no desc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'ok',true,'existing',true,'version_id',v_existing.id,
      'version_no',v_existing.version_no,'cloned_items',0
    );
  end if;

  select * into v_source
  from public.criteria_set_versions
  where criteria_set_id=v_set.id
  order by version_no desc
  limit 1
  for update;

  if not found then raise exception 'Bộ tiêu chí chưa có phiên bản nguồn.'; end if;

  select coalesce(max(version_no),0)+1 into v_new_version_no
  from public.criteria_set_versions
  where criteria_set_id=v_set.id;

  insert into public.criteria_set_versions(
    criteria_set_id,version_no,status,effective_from,created_at,updated_at
  ) values (
    v_set.id,v_new_version_no,'DRAFT',p_effective_from,v_now,v_now
  )
  returning id into v_new_version_id;

  for v_item in
    select * from public.criteria_items
    where criteria_version_id=v_source.id
      and parent_criteria_item_id is null
    order by sequence_no,id
  loop
    insert into public.criteria_items(
      criteria_version_id,code,title,description,sequence_no,
      chapter_code,chapter_name,score_weight,is_core,is_mandatory,max_score,
      parent_criteria_item_id,item_type,owner_department_id,is_active,created_at,updated_at
    ) values (
      v_new_version_id,v_item.code,v_item.title,v_item.description,v_item.sequence_no,
      v_item.chapter_code,v_item.chapter_name,v_item.score_weight,v_item.is_core,
      v_item.is_mandatory,v_item.max_score,null,
      coalesce(v_item.item_type,'CRITERION'),v_item.owner_department_id,v_item.is_active,v_now,v_now
    )
    returning id into v_new_item_id;
    v_id_map:=v_id_map||jsonb_build_object(v_item.id::text,v_new_item_id::text);
    v_cloned:=v_cloned+1;
  end loop;

  for v_item in
    select * from public.criteria_items
    where criteria_version_id=v_source.id
      and parent_criteria_item_id is not null
    order by sequence_no,id
  loop
    if not (v_id_map ? v_item.parent_criteria_item_id::text) then
      raise exception 'Không sao chép được cấu trúc cha/con của tiêu chí.';
    end if;

    insert into public.criteria_items(
      criteria_version_id,code,title,description,sequence_no,
      chapter_code,chapter_name,score_weight,is_core,is_mandatory,max_score,
      parent_criteria_item_id,item_type,owner_department_id,is_active,created_at,updated_at
    ) values (
      v_new_version_id,v_item.code,v_item.title,v_item.description,v_item.sequence_no,
      v_item.chapter_code,v_item.chapter_name,v_item.score_weight,v_item.is_core,
      v_item.is_mandatory,v_item.max_score,
      (v_id_map->>v_item.parent_criteria_item_id::text)::uuid,
      coalesce(v_item.item_type,'SUBITEM'),v_item.owner_department_id,v_item.is_active,v_now,v_now
    )
    returning id into v_new_item_id;
    v_id_map:=v_id_map||jsonb_build_object(v_item.id::text,v_new_item_id::text);
    v_cloned:=v_cloned+1;
  end loop;

  insert into public.audit_logs(
    actor_user_id,table_name,row_id,action_type,new_value,reason,request_meta
  ) values (
    p_actor_user_id,'criteria_set_versions',v_new_version_id,'CRITERIA_VERSION_CREATE',
    jsonb_build_object(
      'criteria_set_id',v_set.id,'source_version_id',v_source.id,
      'version_no',v_new_version_no,'status','DRAFT',
      'effective_from',p_effective_from,'cloned_items',v_cloned
    ),
    'Tạo bản cập nhật Nháp từ phiên bản gần nhất.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_create_criteria_revision_v1')
  );

  return jsonb_build_object(
    'ok',true,'existing',false,'version_id',v_new_version_id,
    'version_no',v_new_version_no,'cloned_items',v_cloned
  );
end;
$function$;

revoke all on function public.qlcl_create_criteria_item_v1(uuid,uuid,text,text,text,uuid,text,integer,text,text,integer,boolean,boolean,numeric,uuid)
  from public,anon,authenticated;
grant execute on function public.qlcl_create_criteria_item_v1(uuid,uuid,text,text,text,uuid,text,integer,text,text,integer,boolean,boolean,numeric,uuid)
  to service_role;
