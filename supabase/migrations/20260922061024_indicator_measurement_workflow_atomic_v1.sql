alter table public.indicator_measurements
  add column if not exists verified_by uuid,
  add column if not exists locked_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.indicator_measurements'::regclass
      and conname='indicator_measurements_verified_by_fkey'
  ) then
    alter table public.indicator_measurements
      add constraint indicator_measurements_verified_by_fkey
      foreign key (verified_by) references auth.users(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.indicator_measurements'::regclass
      and conname='indicator_measurements_locked_by_fkey'
  ) then
    alter table public.indicator_measurements
      add constraint indicator_measurements_locked_by_fkey
      foreign key (locked_by) references auth.users(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.indicator_measurements'::regclass
      and conname='indicator_measurements_workflow_status_check'
  ) then
    alter table public.indicator_measurements
      add constraint indicator_measurements_workflow_status_check
      check (workflow_status in ('DRAFT','RETURNED','SUBMITTED','VERIFIED','LOCKED'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.indicator_measurements'::regclass
      and conname='indicator_measurements_result_level_check'
  ) then
    alter table public.indicator_measurements
      add constraint indicator_measurements_result_level_check
      check (result_level is null or result_level in ('MEETS_TARGET','OUT_OF_TARGET','NOT_EVALUATED'));
  end if;
end
$$;

create or replace function public.qlcl_indicator_measurement_transition_v1(
  p_record_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_numerator numeric,
  p_denominator numeric,
  p_raw numeric,
  p_comment text,
  p_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_org uuid;
  v_actor_active boolean;
  v_record public.records%rowtype;
  v_measurement public.indicator_measurements%rowtype;
  v_assignment public.indicator_assignments%rowtype;
  v_version public.indicator_definition_versions%rowtype;
  v_definition public.indicator_definitions%rowtype;
  v_action text := upper(trim(coalesce(p_action,'')));
  v_old_status text;
  v_new_status text;
  v_reason text := nullif(trim(coalesce(p_comment,'')),'');
  v_calc_type text;
  v_direction text;
  v_multiplier numeric;
  v_calculated numeric;
  v_level text;
begin
  if p_record_id is null or p_actor_user_id is null or p_at is null or v_action='' then
    raise exception 'Required indicator workflow parameters are missing';
  end if;
  if v_action not in ('SAVE','SUBMIT','VERIFY','RETURN','LOCK') then
    raise exception 'Unsupported indicator workflow action %',v_action;
  end if;

  select organization_id,is_active
  into v_actor_org,v_actor_active
  from public.profiles
  where user_id=p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active,false) then
    raise exception 'Indicator actor is not active';
  end if;

  select * into v_record
  from public.records
  where id=p_record_id
    and record_type='INDICATOR_MEASUREMENT'
  for update;
  if not found then raise exception 'Indicator measurement record not found'; end if;
  if v_record.organization_id is distinct from v_actor_org then
    raise exception 'Indicator measurement is outside current organization';
  end if;
  if v_record.lifecycle_status <> 'ACTIVE' then
    raise exception 'Indicator measurement record is not active';
  end if;

  select * into v_measurement
  from public.indicator_measurements
  where record_id=p_record_id
  for update;
  if not found then raise exception 'Indicator measurement row not found'; end if;

  v_old_status := v_measurement.workflow_status;
  v_calculated := v_measurement.calculated_value;
  v_level := v_measurement.result_level;
  v_new_status := v_old_status;

  select * into v_assignment
  from public.indicator_assignments
  where id=v_measurement.indicator_assignment_id;
  if not found then raise exception 'Indicator assignment not found'; end if;

  select * into v_version
  from public.indicator_definition_versions
  where id=v_assignment.indicator_version_id;
  if not found then raise exception 'Indicator version not found'; end if;

  select * into v_definition
  from public.indicator_definitions
  where id=v_version.indicator_definition_id;
  if not found or v_definition.organization_id is distinct from v_actor_org then
    raise exception 'Indicator definition is outside current organization';
  end if;

  if v_action in ('SAVE','SUBMIT') then
    if v_old_status not in ('DRAFT','RETURNED') then
      raise exception 'Only DRAFT or RETURNED measurements may be edited';
    end if;
    if v_assignment.status <> 'ACTIVE' then
      raise exception 'Indicator assignment is not active';
    end if;
    if p_numerator is not null and p_numerator < 0
      or p_denominator is not null and p_denominator < 0
      or p_raw is not null and p_raw < 0 then
      raise exception 'Indicator values cannot be negative';
    end if;

    v_calc_type := upper(coalesce(v_version.calculation_type,'RAW'));
    v_direction := upper(coalesce(v_version.desired_direction,'NEUTRAL'));
    v_multiplier := coalesce(v_version.multiplier,1);

    if v_calc_type in ('PERCENTAGE','RATIO','RATE') then
      if p_numerator is null or p_denominator is null or p_denominator <= 0 then
        raise exception 'Numerator and positive denominator are required';
      end if;
      v_calculated := (p_numerator / p_denominator) * v_multiplier;
    elsif v_calc_type='AVERAGE' then
      if p_raw is not null then
        v_calculated := p_raw;
      elsif p_numerator is not null and p_denominator is not null and p_denominator > 0 then
        v_calculated := (p_numerator / p_denominator) * v_multiplier;
      else
        raise exception 'Average requires raw value or numerator and positive denominator';
      end if;
    elsif v_calc_type='COUNT' then
      if p_raw is not null then v_calculated := p_raw;
      elsif p_numerator is not null then v_calculated := p_numerator;
      else raise exception 'Count value is required';
      end if;
    elsif v_calc_type='RAW' then
      if p_raw is not null then v_calculated := p_raw;
      elsif p_numerator is not null then v_calculated := p_numerator;
      else raise exception 'Raw indicator value is required';
      end if;
    else
      raise exception 'Unsupported indicator calculation type %',v_calc_type;
    end if;

    if v_assignment.local_target is null or v_direction='NEUTRAL' then
      v_level := 'NOT_EVALUATED';
    elsif v_direction='HIGHER_IS_BETTER' then
      v_level := case when v_calculated >= v_assignment.local_target then 'MEETS_TARGET' else 'OUT_OF_TARGET' end;
    elsif v_direction='LOWER_IS_BETTER' then
      v_level := case when v_calculated <= v_assignment.local_target then 'MEETS_TARGET' else 'OUT_OF_TARGET' end;
    elsif v_direction='TARGET_RANGE' then
      raise exception 'TARGET_RANGE requires lower and upper target configuration';
    else
      raise exception 'Unsupported indicator direction %',v_direction;
    end if;

    v_new_status := case when v_action='SUBMIT' then 'SUBMITTED' else v_old_status end;

    update public.indicator_measurements
    set numerator_value=p_numerator,
        denominator_value=p_denominator,
        raw_value=p_raw,
        calculated_value=v_calculated,
        result_level=v_level,
        workflow_status=v_new_status,
        entered_by=p_actor_user_id,
        submitted_at=case when v_action='SUBMIT' then p_at else null end,
        verified_at=null,
        verified_by=null,
        locked_at=null,
        locked_by=null,
        updated_at=p_at
    where id=v_measurement.id;

    if v_action='SUBMIT' and v_reason is null then
      v_reason := 'Gửi dữ liệu chỉ số để xác minh.';
    end if;

  elsif v_action='VERIFY' then
    if v_old_status <> 'SUBMITTED' then
      raise exception 'Only SUBMITTED measurements may be verified';
    end if;
    if v_measurement.calculated_value is null then
      raise exception 'Calculated indicator value is required before verification';
    end if;

    v_new_status := 'VERIFIED';
    v_calculated := v_measurement.calculated_value;
    v_level := v_measurement.result_level;
    update public.indicator_measurements
    set workflow_status=v_new_status,
        verified_at=p_at,
        verified_by=p_actor_user_id,
        updated_at=p_at
    where id=v_measurement.id;
    if v_reason is null then v_reason := 'Dữ liệu và công thức đã được xác minh.'; end if;

  elsif v_action='RETURN' then
    if v_old_status <> 'SUBMITTED' then
      raise exception 'Only SUBMITTED measurements may be returned';
    end if;
    if v_reason is null then
      raise exception 'Return reason is required';
    end if;

    v_new_status := 'RETURNED';
    v_calculated := v_measurement.calculated_value;
    v_level := v_measurement.result_level;
    update public.indicator_measurements
    set workflow_status=v_new_status,
        verified_at=null,
        verified_by=null,
        locked_at=null,
        locked_by=null,
        updated_at=p_at
    where id=v_measurement.id;

  else
    if v_old_status <> 'VERIFIED' then
      raise exception 'Only VERIFIED measurements may be locked';
    end if;

    v_new_status := 'LOCKED';
    v_calculated := v_measurement.calculated_value;
    v_level := v_measurement.result_level;
    update public.indicator_measurements
    set workflow_status=v_new_status,
        locked_at=p_at,
        locked_by=p_actor_user_id,
        updated_at=p_at
    where id=v_measurement.id;
    if v_reason is null then
      v_reason := 'Khóa kỳ đo sau xác minh; mọi điều chỉnh tiếp theo phải có lịch sử và giải trình.';
    end if;
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  )
  values(
    p_actor_user_id,p_record_id,'indicator_measurements',v_measurement.id,
    'INDICATOR_' || v_action,
    jsonb_build_object(
      'workflow_status',v_old_status,
      'calculated_value',v_measurement.calculated_value,
      'result_level',v_measurement.result_level
    ),
    jsonb_build_object(
      'workflow_status',v_new_status,
      'calculated_value',v_calculated,
      'result_level',v_level
    ),
    v_reason,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_indicator_measurement_transition_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'status',v_new_status,
    'calculated_value',v_calculated,
    'result_level',v_level,
    'action',v_action
  );
end;
$$;

revoke execute on function public.qlcl_indicator_measurement_transition_v1(uuid,uuid,text,numeric,numeric,numeric,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.qlcl_indicator_measurement_transition_v1(uuid,uuid,text,numeric,numeric,numeric,text,timestamptz)
  to service_role;
