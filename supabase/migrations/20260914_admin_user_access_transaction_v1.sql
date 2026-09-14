-- QLCL-TTSG Admin User Access Transaction V1
-- Atomically applies profile organization, roles, scopes and permission overrides.
-- Auth user creation/deletion stays in Supabase Auth and is compensated by the API.

begin;

create or replace function qlcl_set_user_access_v1(
  p_target_user_id uuid,
  p_actor_user_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor profiles%rowtype;
  v_target profiles%rowtype;
  v_org_id uuid;
  v_full_name text:=trim(coalesce(p_payload->>'full_name',''));
  v_phone text:=nullif(trim(coalesce(p_payload->>'phone','')),'');
  v_job_title text:=nullif(trim(coalesce(p_payload->>'job_title','')),'');
  v_primary_department_id uuid;
  v_scope_mode text:=upper(coalesce(nullif(trim(p_payload->>'scope_mode'),''),'DEPARTMENT'));
  v_role_ids uuid[]:='{}'::uuid[];
  v_effective_permission_ids uuid[]:='{}'::uuid[];
  v_scope_department_ids uuid[]:='{}'::uuid[];
  v_role_count integer;
  v_perm_count integer;
  v_dept_count integer;
begin
  if p_target_user_id is null or p_actor_user_id is null then raise exception 'target_user_id and actor_user_id are required'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'payload must be a JSON object'; end if;
  if v_full_name='' then raise exception 'full_name is required'; end if;
  if v_scope_mode not in ('HOSPITAL','DEPARTMENT','MULTI_DEPARTMENT') then raise exception 'Invalid scope_mode'; end if;

  select * into v_actor from profiles where user_id=p_actor_user_id for update;
  if not found or not v_actor.is_active or v_actor.organization_id is null then raise exception 'Actor profile is invalid'; end if;
  v_org_id:=v_actor.organization_id;

  select * into v_target from profiles where user_id=p_target_user_id for update;
  if not found then raise exception 'Target profile not found'; end if;
  if v_target.organization_id is not null and v_target.organization_id<>v_org_id then raise exception 'Target user belongs to another organization'; end if;

  begin
    select coalesce(array_agg(distinct value::uuid),'{}'::uuid[])
    into v_role_ids
    from jsonb_array_elements_text(coalesce(p_payload->'role_ids','[]'::jsonb));
  exception when others then raise exception 'role_ids contains invalid UUID'; end;
  if cardinality(v_role_ids)<1 then raise exception 'At least one role is required'; end if;
  select count(*) into v_role_count from roles where id=any(v_role_ids) and is_active;
  if v_role_count<>cardinality(v_role_ids) then raise exception 'One or more roles are invalid/inactive'; end if;

  begin
    select coalesce(array_agg(distinct value::uuid),'{}'::uuid[])
    into v_effective_permission_ids
    from jsonb_array_elements_text(coalesce(p_payload->'effective_permission_ids','[]'::jsonb));
  exception when others then raise exception 'effective_permission_ids contains invalid UUID'; end;
  if cardinality(v_effective_permission_ids)>0 then
    select count(*) into v_perm_count from permissions where id=any(v_effective_permission_ids) and is_active;
    if v_perm_count<>cardinality(v_effective_permission_ids) then raise exception 'One or more effective permissions are invalid/inactive'; end if;
  end if;

  if nullif(trim(coalesce(p_payload->>'primary_department_id','')),'') is not null then
    begin v_primary_department_id:=(p_payload->>'primary_department_id')::uuid; exception when others then raise exception 'primary_department_id is invalid'; end;
    if not exists(select 1 from departments d where d.id=v_primary_department_id and d.organization_id=v_org_id and d.is_active) then
      raise exception 'Primary department is invalid or outside organization';
    end if;
  end if;

  begin
    select coalesce(array_agg(distinct value::uuid),'{}'::uuid[])
    into v_scope_department_ids
    from jsonb_array_elements_text(coalesce(p_payload->'scope_department_ids','[]'::jsonb));
  exception when others then raise exception 'scope_department_ids contains invalid UUID'; end;

  if v_scope_mode<>'HOSPITAL' then
    if cardinality(v_scope_department_ids)<1 then raise exception 'At least one scope department is required'; end if;
    select count(*) into v_dept_count from departments where id=any(v_scope_department_ids) and organization_id=v_org_id and is_active;
    if v_dept_count<>cardinality(v_scope_department_ids) then raise exception 'One or more scope departments are invalid/outside organization'; end if;
  end if;

  update profiles
  set organization_id=v_org_id,
      full_name=v_full_name,
      phone=v_phone,
      job_title=v_job_title,
      primary_department_id=v_primary_department_id,
      is_active=true,
      updated_at=now()
  where user_id=p_target_user_id;

  delete from user_roles where user_id=p_target_user_id;
  insert into user_roles(user_id,role_id,assigned_by)
  select p_target_user_id,unnest(v_role_ids),p_actor_user_id;

  delete from user_scopes where user_id=p_target_user_id;
  if v_scope_mode='HOSPITAL' then
    insert into user_scopes(user_id,scope_type,granted_by)
    values(p_target_user_id,'HOSPITAL',p_actor_user_id);
  else
    insert into user_scopes(user_id,scope_type,department_id,granted_by)
    select p_target_user_id,
           case when cardinality(v_scope_department_ids)>1 then 'MULTI_DEPARTMENT' else 'DEPARTMENT' end,
           d,
           p_actor_user_id
    from unnest(v_scope_department_ids) d;
  end if;

  delete from user_permissions where user_id=p_target_user_id;
  insert into user_permissions(user_id,permission_id,is_allowed,assigned_by)
  select p_target_user_id,p.id,wanted,p_actor_user_id
  from (
    select p.id,
           (p.id=any(v_effective_permission_ids)) as wanted,
           exists(
             select 1 from role_permissions rp
             where rp.permission_id=p.id and rp.role_id=any(v_role_ids)
           ) as baseline
    from permissions p
    where p.is_active
  ) p
  where p.wanted<>p.baseline;

  return jsonb_build_object(
    'ok',true,
    'user_id',p_target_user_id,
    'organization_id',v_org_id,
    'role_count',cardinality(v_role_ids),
    'scope_mode',v_scope_mode,
    'scope_department_count',case when v_scope_mode='HOSPITAL' then 0 else cardinality(v_scope_department_ids) end,
    'effective_permission_count',cardinality(v_effective_permission_ids)
  );
end;
$$;

revoke all on function qlcl_set_user_access_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function qlcl_set_user_access_v1(uuid,uuid,jsonb) to service_role;

commit;
