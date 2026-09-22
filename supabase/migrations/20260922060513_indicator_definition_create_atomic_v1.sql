create or replace function public.qlcl_create_indicator_definition_v1(
  p_actor_user_id uuid,
  p_code text,
  p_name text,
  p_purpose text,
  p_quality_dimension text,
  p_calculation_type text,
  p_desired_direction text,
  p_frequency text,
  p_unit text,
  p_multiplier numeric,
  p_effective_from date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_org uuid;
  v_actor_active boolean;
  v_code text := upper(nullif(trim(coalesce(p_code,'')),''));
  v_name text := nullif(trim(coalesce(p_name,'')),'');
  v_calc text := upper(trim(coalesce(p_calculation_type,'RAW')));
  v_direction text := upper(trim(coalesce(p_desired_direction,'NEUTRAL')));
  v_frequency text := upper(trim(coalesce(p_frequency,'MONTHLY')));
  v_work_year integer := extract(year from (now() at time zone 'Asia/Ho_Chi_Minh'))::integer;
  v_definition_id uuid;
  v_version_id uuid;
begin
  if p_actor_user_id is null then raise exception 'Indicator actor is required'; end if;
  if v_name is null then raise exception 'Indicator name is required'; end if;
  if v_calc not in ('RAW','PERCENTAGE','RATIO','RATE','AVERAGE','COUNT') then
    raise exception 'Invalid indicator calculation type';
  end if;
  if v_direction not in ('HIGHER_IS_BETTER','LOWER_IS_BETTER','TARGET_RANGE','NEUTRAL') then
    raise exception 'Invalid indicator direction';
  end if;
  if v_frequency not in ('DAILY','WEEKLY','MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL') then
    raise exception 'Invalid indicator frequency';
  end if;

  select organization_id,is_active
  into v_actor_org,v_actor_active
  from public.profiles
  where user_id=p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active,false) then
    raise exception 'Indicator actor is not active';
  end if;

  if v_code is null then
    v_code := public.qlcl_next_master_code_v1(v_actor_org,'INDICATOR',v_work_year);
  end if;

  if exists(
    select 1 from public.indicator_definitions
    where organization_id=v_actor_org and code=v_code
  ) then
    raise exception 'Indicator code already exists';
  end if;

  insert into public.indicator_definitions(
    organization_id,code,name,purpose,quality_dimension,is_active,updated_at
  )
  values(
    v_actor_org,v_code,v_name,
    nullif(trim(coalesce(p_purpose,'')),''),
    nullif(trim(coalesce(p_quality_dimension,'')),''),
    true,now()
  )
  returning id into v_definition_id;

  insert into public.indicator_definition_versions(
    indicator_definition_id,version_no,status,calculation_type,
    desired_direction,frequency,unit,multiplier,effective_from
  )
  values(
    v_definition_id,1,'DRAFT',v_calc,v_direction,v_frequency,
    nullif(trim(coalesce(p_unit,'')),''),
    p_multiplier,p_effective_from
  )
  returning id into v_version_id;

  return jsonb_build_object(
    'ok',true,
    'id',v_definition_id,
    'code',v_code,
    'name',v_name,
    'version_id',v_version_id,
    'version_no',1,
    'status','DRAFT'
  );
end;
$$;

revoke execute on function public.qlcl_create_indicator_definition_v1(uuid,text,text,text,text,text,text,text,text,numeric,date)
  from public, anon, authenticated;
grant execute on function public.qlcl_create_indicator_definition_v1(uuid,text,text,text,text,text,text,text,text,numeric,date)
  to service_role;
