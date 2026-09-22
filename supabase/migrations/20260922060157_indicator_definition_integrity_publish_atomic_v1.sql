create unique index if not exists ux_indicator_definitions_org_code
  on public.indicator_definitions(organization_id, code)
  where code is not null;

create unique index if not exists ux_indicator_definition_versions_number
  on public.indicator_definition_versions(indicator_definition_id, version_no);

create unique index if not exists ux_indicator_definition_versions_one_published
  on public.indicator_definition_versions(indicator_definition_id)
  where status='PUBLISHED';

create or replace function public.qlcl_publish_indicator_version_v1(
  p_indicator_definition_id uuid,
  p_version_id uuid,
  p_actor_user_id uuid,
  p_published_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_org uuid;
  v_actor_active boolean;
  v_definition public.indicator_definitions%rowtype;
  v_version public.indicator_definition_versions%rowtype;
  v_effective_from date;
  v_previous_to date;
begin
  if p_indicator_definition_id is null or p_version_id is null or p_actor_user_id is null or p_published_at is null then
    raise exception 'Required indicator publish parameters are missing';
  end if;

  select organization_id,is_active
  into v_actor_org,v_actor_active
  from public.profiles
  where user_id=p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active,false) then
    raise exception 'Indicator actor is not active';
  end if;

  select * into v_definition
  from public.indicator_definitions
  where id=p_indicator_definition_id
  for update;
  if not found or not v_definition.is_active then
    raise exception 'Indicator definition not found or inactive';
  end if;
  if v_definition.organization_id is distinct from v_actor_org then
    raise exception 'Indicator definition is outside current organization';
  end if;

  select * into v_version
  from public.indicator_definition_versions
  where id=p_version_id
    and indicator_definition_id=p_indicator_definition_id
  for update;
  if not found then raise exception 'Indicator version not found'; end if;
  if v_version.status <> 'DRAFT' then
    raise exception 'Indicator version must be DRAFT';
  end if;
  if v_version.calculation_type is null or v_version.desired_direction is null or v_version.frequency is null then
    raise exception 'Indicator version is missing calculation or frequency';
  end if;

  v_effective_from := coalesce(
    v_version.effective_from,
    (p_published_at at time zone 'Asia/Ho_Chi_Minh')::date
  );
  v_previous_to := v_effective_from - 1;

  update public.indicator_definition_versions
  set status='RETIRED',
      effective_to=v_previous_to,
      updated_at=p_published_at
  where indicator_definition_id=p_indicator_definition_id
    and status='PUBLISHED'
    and id<>p_version_id;

  update public.indicator_definition_versions
  set status='PUBLISHED',
      effective_from=v_effective_from,
      effective_to=null,
      published_at=p_published_at,
      updated_at=p_published_at
  where id=p_version_id
    and status='DRAFT';

  if not found then raise exception 'Indicator version publish race detected'; end if;

  return jsonb_build_object(
    'ok',true,
    'version_id',p_version_id,
    'version_no',v_version.version_no,
    'status','PUBLISHED',
    'effective_from',v_effective_from,
    'published_at',p_published_at
  );
end;
$$;

revoke execute on function public.qlcl_publish_indicator_version_v1(uuid,uuid,uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.qlcl_publish_indicator_version_v1(uuid,uuid,uuid,timestamptz)
  to service_role;
