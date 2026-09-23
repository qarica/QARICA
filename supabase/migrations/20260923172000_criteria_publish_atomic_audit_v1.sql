-- QARICA criteria version publish atomic transaction V1.

create unique index if not exists uq_criteria_set_versions_one_published
  on public.criteria_set_versions(criteria_set_id)
  where status='PUBLISHED';

create or replace function public.qlcl_publish_criteria_version_v1(
  p_criteria_set_id uuid,
  p_version_id uuid,
  p_actor_user_id uuid
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
  v_active_items integer := 0;
  v_effective_from date;
  v_previous_to date;
  v_now timestamptz := now();
  v_retired_count integer := 0;
begin
  if p_criteria_set_id is null or p_version_id is null or p_actor_user_id is null then
    raise exception 'Thiếu bộ tiêu chí, phiên bản hoặc người phát hành.';
  end if;

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
  if not found then
    raise exception 'Không tìm thấy bộ tiêu chí trong tổ chức hiện tại.';
  end if;
  if not v_set.is_active then
    raise exception 'Bộ tiêu chí đã ngưng áp dụng.';
  end if;

  select * into v_version
  from public.criteria_set_versions
  where id=p_version_id
    and criteria_set_id=p_criteria_set_id
  for update;
  if not found then
    raise exception 'Không tìm thấy phiên bản cần phát hành.';
  end if;
  if v_version.status <> 'DRAFT' then
    raise exception 'Chỉ phiên bản Nháp mới được phát hành.';
  end if;

  select count(*) into v_active_items
  from public.criteria_items
  where criteria_version_id=p_version_id
    and is_active=true;
  if v_active_items < 1 then
    raise exception 'Phiên bản chưa có tiêu chí hoạt động.';
  end if;

  v_effective_from := coalesce(v_version.effective_from,(v_now at time zone 'Asia/Ho_Chi_Minh')::date);
  v_previous_to := v_effective_from - 1;

  update public.criteria_set_versions
  set status='RETIRED',
      effective_to=v_previous_to,
      updated_at=v_now
  where criteria_set_id=p_criteria_set_id
    and status='PUBLISHED'
    and id<>p_version_id;
  get diagnostics v_retired_count = row_count;

  update public.criteria_set_versions
  set status='PUBLISHED',
      effective_from=v_effective_from,
      effective_to=null,
      published_at=v_now,
      updated_at=v_now
  where id=p_version_id
    and criteria_set_id=p_criteria_set_id
    and status='DRAFT';
  if not found then
    raise exception 'Trạng thái phiên bản đã thay đổi. Vui lòng tải lại.';
  end if;

  insert into public.audit_logs(
    actor_user_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,
    'criteria_set_versions',
    p_version_id,
    'CRITERIA_SET_PUBLISH',
    jsonb_build_object(
      'status',v_version.status,
      'effective_from',v_version.effective_from,
      'effective_to',v_version.effective_to
    ),
    jsonb_build_object(
      'status','PUBLISHED',
      'version_no',v_version.version_no,
      'effective_from',v_effective_from,
      'active_item_count',v_active_items,
      'retired_previous_versions',v_retired_count
    ),
    'Phát hành phiên bản bộ tiêu chí.',
    jsonb_build_object(
      'source','qlcl-ui',
      'organization_id',v_actor.organization_id,
      'criteria_set_id',p_criteria_set_id,
      'transaction','qlcl_publish_criteria_version_v1'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'status','PUBLISHED',
    'version_id',p_version_id,
    'version_no',v_version.version_no,
    'effective_from',v_effective_from,
    'active_item_count',v_active_items,
    'retired_previous_versions',v_retired_count
  );
end;
$function$;

revoke all on function public.qlcl_publish_criteria_version_v1(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.qlcl_publish_criteria_version_v1(uuid,uuid,uuid)
  to service_role;
