-- QARICA Incident contributing factors atomic save V1

create or replace function public.qlcl_save_incident_contributing_factors_v1(
  p_incident_record_id uuid,
  p_actor_user_id uuid,
  p_factor_codes text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_incident public.incidents%rowtype;
  v_old jsonb;
  v_new jsonb;
  v_invalid text;
begin
  if p_actor_user_id is null then
    raise exception 'actor_user_id is required';
  end if;

  select i.* into v_incident
  from public.incidents i
  join public.records r on r.id = i.record_id
  where i.record_id = p_incident_record_id
    and r.record_type = 'INCIDENT'
    and r.lifecycle_status = 'ACTIVE'
  for update;

  if not found then
    raise exception 'Active incident record not found';
  end if;

  if v_incident.workflow_status not in ('INVESTIGATION_REQUIRED','INVESTIGATING') then
    raise exception 'Contributing factors can only be edited during incident investigation';
  end if;

  select x into v_invalid
  from unnest(coalesce(p_factor_codes, array[]::text[])) as x
  where x not in (
    'PATIENT','STAFF','TASK_TECHNOLOGY','TEAM','WORK_ENVIRONMENT',
    'INFORMATION_SYSTEMS','ORGANIZATION_MANAGEMENT','INSTITUTIONAL_CONTEXT'
  )
  limit 1;
  if v_invalid is not null then
    raise exception 'Invalid contributing factor code: %', v_invalid;
  end if;

  select coalesce(jsonb_agg(f.factor_code order by f.factor_code), '[]'::jsonb)
  into v_old
  from public.incident_contributing_factors f
  where f.incident_id = v_incident.id;

  delete from public.incident_contributing_factors
  where incident_id = v_incident.id;

  insert into public.incident_contributing_factors(incident_id, factor_code, created_by)
  select v_incident.id, x, p_actor_user_id
  from (
    select distinct unnest(coalesce(p_factor_codes, array[]::text[])) as x
  ) s
  where x is not null and btrim(x) <> '';

  select coalesce(jsonb_agg(f.factor_code order by f.factor_code), '[]'::jsonb)
  into v_new
  from public.incident_contributing_factors f
  where f.incident_id = v_incident.id;

  insert into public.audit_logs(
    actor_user_id, record_id, table_name, row_id, action_type,
    old_value, new_value, reason, request_meta
  ) values (
    p_actor_user_id, p_incident_record_id, 'incident_contributing_factors', v_incident.id,
    'INCIDENT_CONTRIBUTING_FACTORS_SAVE',
    jsonb_build_object('factors', v_old),
    jsonb_build_object('factors', v_new),
    'Cập nhật yếu tố góp phần trong điều tra sự cố',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_save_incident_contributing_factors_v1')
  );

  return jsonb_build_object('ok', true, 'factors', v_new);
end;
$$;

revoke all on function public.qlcl_save_incident_contributing_factors_v1(uuid,uuid,text[]) from public, anon, authenticated;
grant execute on function public.qlcl_save_incident_contributing_factors_v1(uuid,uuid,text[]) to service_role;
