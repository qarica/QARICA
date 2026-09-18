create unique index if not exists uq_record_links_audit_generated_finding_ref
on public.record_links(
  source_record_id,
  lower((metadata ->> 'audit_source_ref'))
)
where relation_type='GENERATED_FINDING'
  and metadata ? 'audit_source_ref';

create or replace function public.qlcl_audit_create_finding_v1(
  p_audit_record_id uuid,
  p_actor_user_id uuid,
  p_source_ref text,
  p_description text,
  p_severity text,
  p_due_date date,
  p_lead_department_id uuid,
  p_owner_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor public.profiles%rowtype;
  v_audit_record public.records%rowtype;
  v_audit public.audits%rowtype;
  v_department public.departments%rowtype;
  v_owner public.profiles%rowtype;
  v_existing_record_id uuid;
  v_finding_record_id uuid;
  v_finding_id uuid;
  v_finding_code text;
  v_source_ref text;
  v_description text;
  v_severity text;
  v_title text;
  v_priority text;
begin
  v_source_ref := trim(coalesce(p_source_ref,''));
  v_description := trim(coalesce(p_description,''));
  v_severity := upper(trim(coalesce(p_severity,'')));

  if v_source_ref='' then raise exception 'Audit finding reference is required'; end if;
  if length(v_source_ref)>120 then raise exception 'Audit finding reference is too long'; end if;
  if v_description='' then raise exception 'Audit finding description is required'; end if;
  if v_severity not in ('MINOR','MAJOR','CRITICAL') then raise exception 'Audit finding severity is invalid'; end if;
  if p_due_date is null then raise exception 'Audit finding due date is required'; end if;
  if p_lead_department_id is null then raise exception 'Audit finding lead department is required'; end if;
  if p_owner_user_id is null then raise exception 'Audit finding owner is required'; end if;

  select * into v_actor
  from public.profiles
  where user_id=p_actor_user_id and is_active
  for update;
  if not found or v_actor.organization_id is null then
    raise exception 'Actor profile is invalid';
  end if;

  select * into v_audit_record
  from public.records
  where id=p_audit_record_id
    and record_type='AUDIT'
  for update;
  if not found then raise exception 'Audit record not found'; end if;
  if v_audit_record.organization_id<>v_actor.organization_id then
    raise exception 'Audit record is outside organization';
  end if;
  if v_audit_record.lifecycle_status<>'ACTIVE' then
    raise exception 'Audit record is not active';
  end if;

  select * into v_audit
  from public.audits
  where record_id=p_audit_record_id
  for update;
  if not found then raise exception 'Audit data not found'; end if;
  if v_audit.workflow_status not in ('IN_PROGRESS','DRAFT_REPORT','REPORT_REVIEW','FOLLOW_UP') then
    raise exception 'Audit is not in a status that accepts findings';
  end if;

  select target_record_id into v_existing_record_id
  from public.record_links
  where source_record_id=p_audit_record_id
    and relation_type='GENERATED_FINDING'
    and lower(coalesce(metadata->>'audit_source_ref',''))=lower(v_source_ref)
  limit 1;
  if v_existing_record_id is not null then
    return jsonb_build_object(
      'ok',true,
      'already_exists',true,
      'finding_record_id',v_existing_record_id
    );
  end if;

  select * into v_department
  from public.departments
  where id=p_lead_department_id
    and organization_id=v_actor.organization_id
    and is_active;
  if not found then raise exception 'Finding lead department is invalid'; end if;

  select * into v_owner
  from public.profiles
  where user_id=p_owner_user_id
    and organization_id=v_actor.organization_id
    and is_active;
  if not found then raise exception 'Finding owner is invalid'; end if;
  if coalesce(v_owner.primary_department_id,v_owner.department_id) is distinct from p_lead_department_id then
    raise exception 'Finding owner is outside selected lead department';
  end if;

  select public.next_record_code(v_actor.organization_id,'FINDING',v_audit_record.work_year)
  into v_finding_code;

  v_title := left('Audit '||v_audit_record.record_code||' · '||v_source_ref, 240);

  insert into public.records(
    organization_id,record_type,record_code,title,work_year,
    owner_department_id,owner_user_id,lifecycle_status,created_by,metadata
  ) values(
    v_actor.organization_id,'FINDING',v_finding_code,v_title,v_audit_record.work_year,
    p_lead_department_id,p_owner_user_id,'ACTIVE',p_actor_user_id,
    jsonb_build_object(
      'origin','AUDIT',
      'source_record_id',p_audit_record_id,
      'audit_id',v_audit.id,
      'audit_source_ref',v_source_ref
    )
  )
  returning id into v_finding_record_id;

  insert into public.findings(
    record_id,finding_type,description,severity,
    lead_department_id,owner_user_id,identified_at,due_date,workflow_status
  ) values(
    v_finding_record_id,'AUDIT_NONCONFORMITY',v_description,v_severity,
    p_lead_department_id,p_owner_user_id,now(),p_due_date,'ASSIGNED'
  )
  returning id into v_finding_id;

  insert into public.audit_finding_links(audit_id,finding_id)
  values(v_audit.id,v_finding_id);

  insert into public.record_links(
    source_record_id,target_record_id,relation_type,metadata,created_by
  ) values(
    p_audit_record_id,v_finding_record_id,'GENERATED_FINDING',
    jsonb_build_object(
      'origin','AUDIT',
      'audit_id',v_audit.id,
      'finding_id',v_finding_id,
      'audit_source_ref',v_source_ref,
      'severity',v_severity
    ),
    p_actor_user_id
  );

  v_priority := case v_severity when 'CRITICAL' then 'CRITICAL' when 'MAJOR' then 'HIGH' else 'NORMAL' end;

  insert into public.notifications(
    recipient_user_id,notification_type,priority,title,message,
    target_record_id,target_route,notification_event_key,is_read
  ) values(
    p_owner_user_id,'AUDIT_FINDING_ASSIGNED',v_priority,
    'Finding mới từ Audit/Tracer',
    v_finding_code||' · '||v_source_ref||' · hạn '||p_due_date::text,
    v_finding_record_id,'/findings/'||v_finding_record_id::text,
    'audit-finding:'||p_audit_record_id::text||':'||lower(v_source_ref),
    false
  );

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,new_value,reason,request_meta
  ) values(
    p_actor_user_id,p_audit_record_id,'audit_finding_links',v_finding_id,
    'AUDIT_CREATE_FINDING',
    jsonb_build_object(
      'finding_record_id',v_finding_record_id,
      'finding_id',v_finding_id,
      'finding_code',v_finding_code,
      'audit_source_ref',v_source_ref,
      'severity',v_severity,
      'lead_department_id',p_lead_department_id,
      'owner_user_id',p_owner_user_id,
      'due_date',p_due_date
    ),
    v_description,
    jsonb_build_object('source','qlcl-ui','transaction','atomic')
  );

  return jsonb_build_object(
    'ok',true,
    'already_exists',false,
    'finding_record_id',v_finding_record_id,
    'finding_id',v_finding_id,
    'finding_code',v_finding_code
  );
end;
$function$;

revoke all on function public.qlcl_audit_create_finding_v1(uuid,uuid,text,text,text,date,uuid,uuid) from public, anon, authenticated;
grant execute on function public.qlcl_audit_create_finding_v1(uuid,uuid,text,text,text,date,uuid,uuid) to service_role;
