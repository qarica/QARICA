-- QLCL-TTSG External Assessment Transaction V1
-- Atomic External Assessment gap -> Finding creation.
-- Apply only after backup and migration preflight.

begin;

-- Fail fast with a readable message if historical duplicates already exist.
do $$
begin
  if exists (
    select 1
    from record_links
    where relation_type = 'GENERATED_FINDING'
      and metadata ? 'criterion_ref'
    group by source_record_id, lower(metadata->>'criterion_ref')
    having count(*) > 1
  ) then
    raise exception 'Duplicate External Assessment criterion Findings exist. Resolve duplicates before applying transaction hardening.';
  end if;
end $$;

-- One criterion gap per external-assessment source record.
-- Rows without criterion_ref are not constrained because PostgreSQL UNIQUE allows NULLs.
create unique index if not exists uq_record_links_external_gap_criterion
  on record_links(source_record_id, lower((metadata->>'criterion_ref')))
  where relation_type = 'GENERATED_FINDING'
    and metadata ? 'criterion_ref';

create or replace function qlcl_external_assessment_create_gap_finding_v1(
  p_external_record_id uuid,
  p_actor_user_id uuid,
  p_criterion_ref text,
  p_self_score text,
  p_external_score text,
  p_description text,
  p_severity text,
  p_due_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source records%rowtype;
  v_event external_assessment_events%rowtype;
  v_self_record_id uuid;
  v_code text;
  v_finding_record_id uuid;
  v_finding_id uuid;
  v_description text;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if coalesce(trim(p_criterion_ref),'')='' or coalesce(trim(p_self_score),'')='' or coalesce(trim(p_external_score),'')='' or coalesce(trim(p_description),'')='' or p_due_date is null then
    raise exception 'Criterion, scores, description and due date are required';
  end if;
  if coalesce(p_severity,'MAJOR') not in ('MINOR','MAJOR','CRITICAL') then raise exception 'Invalid Finding severity'; end if;

  select * into v_source from records
  where id=p_external_record_id and record_type='EXTERNAL_ASSESSMENT'
  for update;
  if not found then raise exception 'External assessment record not found'; end if;
  if v_source.lifecycle_status <> 'ACTIVE' then raise exception 'External assessment is not active'; end if;

  select * into v_event from external_assessment_events
  where record_id=p_external_record_id
  for update;
  if not found then raise exception 'External assessment event not found'; end if;

  select target_record_id into v_self_record_id
  from record_links
  where source_record_id=p_external_record_id and relation_type='COMPARED_WITH_SELF'
  limit 1;
  if v_self_record_id is null then raise exception 'Self-assessment comparison must be locked first'; end if;

  if exists (
    select 1 from record_links
    where source_record_id=p_external_record_id
      and relation_type='GENERATED_FINDING'
      and lower(coalesce(metadata->>'criterion_ref',''))=lower(trim(p_criterion_ref))
  ) then
    raise exception 'This criterion already generated a Finding';
  end if;

  select next_record_code('FINDING',v_source.work_year) into v_code;
  if v_code is null then raise exception 'Could not allocate Finding record code'; end if;

  insert into records(
    organization_id,record_type,record_code,title,work_year,
    owner_department_id,owner_user_id,lifecycle_status,created_by
  ) values (
    v_source.organization_id,'FINDING',v_code,
    'Chênh lệch '||trim(p_criterion_ref)||' từ '||v_source.record_code,
    v_source.work_year,v_source.owner_department_id,v_source.owner_user_id,
    'ACTIVE',p_actor_user_id
  ) returning id into v_finding_record_id;

  v_description := trim(p_description)||E'\nTự đánh giá: '||trim(p_self_score)||'. Đánh giá ngoài: '||trim(p_external_score)||'.';

  insert into findings(
    record_id,finding_type,description,severity,lead_department_id,owner_user_id,
    identified_at,due_date,workflow_status
  ) values (
    v_finding_record_id,'EXTERNAL_ASSESSMENT_GAP',v_description,coalesce(p_severity,'MAJOR'),
    v_source.owner_department_id,v_source.owner_user_id,
    coalesce(v_event.assessment_date::timestamp,now()),p_due_date,'OPEN'
  ) returning id into v_finding_id;

  insert into record_links(source_record_id,target_record_id,relation_type,metadata,created_by)
  values (
    p_external_record_id,v_finding_record_id,'GENERATED_FINDING',
    jsonb_build_object(
      'criterion_ref',trim(p_criterion_ref),
      'self_score',trim(p_self_score),
      'external_score',trim(p_external_score),
      'finding_id',v_finding_id,
      'self_record_id',v_self_record_id
    ),
    p_actor_user_id
  );

  insert into audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_external_record_id,'external_assessment_events',v_event.id,
    'EXTERNAL_ASSESSMENT_CREATE_GAP_FINDING',
    jsonb_build_object('finding_record_id',v_finding_record_id,'finding_id',v_finding_id,'criterion_ref',trim(p_criterion_ref)),
    trim(p_description),
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_external_assessment_create_gap_finding_v1')
  );

  return jsonb_build_object('ok',true,'finding_record_id',v_finding_record_id,'finding_id',v_finding_id,'finding_code',v_code);
end;
$$;

revoke all on function qlcl_external_assessment_create_gap_finding_v1(uuid,uuid,text,text,text,text,text,date) from public;
revoke all on function qlcl_external_assessment_create_gap_finding_v1(uuid,uuid,text,text,text,text,text,date) from anon;
revoke all on function qlcl_external_assessment_create_gap_finding_v1(uuid,uuid,text,text,text,text,text,date) from authenticated;
grant execute on function qlcl_external_assessment_create_gap_finding_v1(uuid,uuid,text,text,text,text,text,date) to service_role;

commit;
