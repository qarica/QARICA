create or replace function public.qlcl_publish_checklist_version_v1(
  p_template_id uuid,
  p_version_id uuid,
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_published_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template public.checklist_templates%rowtype;
  v_version public.checklist_versions%rowtype;
  v_section_count integer;
  v_item_count integer;
  v_previous_to date;
begin
  if p_template_id is null or p_version_id is null or p_organization_id is null or p_actor_user_id is null then
    raise exception 'Required publish parameters are missing';
  end if;

  select * into v_template
  from public.checklist_templates
  where id = p_template_id
  for update;

  if not found or not v_template.is_active then
    raise exception 'Checklist template not found or inactive';
  end if;
  if v_template.organization_id is distinct from p_organization_id then
    raise exception 'Checklist template is outside current organization';
  end if;

  select * into v_version
  from public.checklist_versions
  where id = p_version_id
    and checklist_template_id = p_template_id
  for update;

  if not found then raise exception 'Checklist version not found'; end if;
  if v_version.status <> 'DRAFT' then
    raise exception 'Checklist version must be DRAFT';
  end if;

  select count(*) into v_section_count
  from public.checklist_sections
  where checklist_version_id = p_version_id;

  select count(*) into v_item_count
  from public.checklist_items
  where checklist_version_id = p_version_id;

  if v_section_count < 1 or v_item_count < 1 then
    raise exception 'Checklist version requires at least one section and one item';
  end if;

  v_previous_to := (p_published_at at time zone 'UTC')::date - 1;

  update public.checklist_versions
  set status='RETIRED', effective_to=v_previous_to
  where checklist_template_id=p_template_id
    and status='PUBLISHED'
    and id<>p_version_id;

  update public.checklist_versions
  set status='PUBLISHED',
      published_at=p_published_at,
      published_by=p_actor_user_id,
      effective_from=(p_published_at at time zone 'UTC')::date,
      effective_to=null
  where id=p_version_id
    and status='DRAFT';

  if not found then raise exception 'Checklist version publish race detected'; end if;

  return jsonb_build_object(
    'ok',true,
    'version_id',p_version_id,
    'status','PUBLISHED',
    'published_at',p_published_at,
    'effective_from',(p_published_at at time zone 'UTC')::date,
    'retired_effective_to',v_previous_to
  );
end;
$$;

revoke execute on function public.qlcl_publish_checklist_version_v1(uuid,uuid,uuid,uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.qlcl_publish_checklist_version_v1(uuid,uuid,uuid,uuid,timestamptz)
  to service_role;
