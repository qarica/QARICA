-- QARICA criteria item active-state atomic transaction V1.
create or replace function public.qlcl_set_criteria_item_active_v1(
  p_actor_user_id uuid,
  p_criteria_item_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor public.profiles%rowtype;
  v_item public.criteria_items%rowtype;
  v_version public.criteria_set_versions%rowtype;
  v_set public.criteria_sets%rowtype;
  v_now timestamptz := now();
  v_children_changed integer := 0;
begin
  select * into v_actor
  from public.profiles
  where user_id=p_actor_user_id and is_active=true;
  if not found or v_actor.organization_id is null then
    raise exception 'Tài khoản không hợp lệ hoặc chưa gắn tổ chức.';
  end if;

  select * into v_item
  from public.criteria_items
  where id=p_criteria_item_id
  for update;
  if not found then raise exception 'Không tìm thấy tiêu chí.'; end if;

  select * into v_version
  from public.criteria_set_versions
  where id=v_item.criteria_version_id;
  if not found then raise exception 'Phiên bản tiêu chí không tồn tại.'; end if;

  select * into v_set
  from public.criteria_sets
  where id=v_version.criteria_set_id
    and organization_id=v_actor.organization_id;
  if not found then raise exception 'Tiêu chí nằm ngoài phạm vi tổ chức hiện tại.'; end if;

  update public.criteria_items
  set is_active=coalesce(p_is_active,false),updated_at=v_now
  where id=v_item.id;

  if coalesce(p_is_active,false)=false and v_item.parent_criteria_item_id is null then
    update public.criteria_items
    set is_active=false,updated_at=v_now
    where parent_criteria_item_id=v_item.id
      and is_active=true;
    get diagnostics v_children_changed=row_count;
  end if;

  insert into public.audit_logs(
    actor_user_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,'criteria_items',v_item.id,'CRITERIA_ITEM_ACTIVE_STATE',
    jsonb_build_object(
      'is_active',v_item.is_active,
      'parent_criteria_item_id',v_item.parent_criteria_item_id
    ),
    jsonb_build_object(
      'is_active',coalesce(p_is_active,false),
      'children_deactivated',v_children_changed
    ),
    case when coalesce(p_is_active,false)
      then 'Kích hoạt lại tiêu chí/tiểu mục.'
      else 'Ngưng áp dụng tiêu chí/tiểu mục.'
    end,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_set_criteria_item_active_v1')
  );

  return jsonb_build_object(
    'ok',true,'id',v_item.id,'is_active',coalesce(p_is_active,false),
    'children_deactivated',v_children_changed
  );
end;
$function$;

revoke all on function public.qlcl_set_criteria_item_active_v1(uuid,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.qlcl_set_criteria_item_active_v1(uuid,uuid,boolean)
  to service_role;
