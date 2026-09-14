-- QLCL-TTSG Transaction Hardening V1
-- Scope: atomic Finding -> CAPA escalation + DB-level duplicate protection.
-- IMPORTANT: apply to Supabase only after preview CI PASS and database backup.

begin;

-- Fail fast if historical duplicates already exist. Resolve them manually before retrying migration.
do $$
begin
  if exists (
    select 1
    from record_links
    where relation_type = 'ESCALATED_TO_CAPA'
    group by source_record_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate ESCALATED_TO_CAPA links exist. Resolve duplicates before applying transaction hardening.';
  end if;
end $$;

create unique index if not exists uq_record_links_one_capa_per_finding
  on record_links(source_record_id)
  where relation_type = 'ESCALATED_TO_CAPA';

create or replace function qlcl_escalate_finding_to_capa_v1(
  p_finding_record_id uuid,
  p_actor_user_id uuid,
  p_priority text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record records%rowtype;
  v_finding findings%rowtype;
  v_verification_no integer;
  v_capa_code text;
  v_capa_record_id uuid;
  v_capa_id uuid;
begin
  if p_actor_user_id is null then
    raise exception 'actor_user_id is required';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Verification comment is required';
  end if;
  if p_priority not in ('NORMAL','HIGH','URGENT','CRITICAL') then
    raise exception 'Invalid CAPA priority';
  end if;

  select * into v_record
  from records
  where id = p_finding_record_id
    and record_type = 'FINDING'
  for update;

  if not found then
    raise exception 'Finding record not found';
  end if;
  if v_record.lifecycle_status <> 'ACTIVE' then
    raise exception 'Finding record is not active';
  end if;

  select * into v_finding
  from findings
  where record_id = p_finding_record_id
  for update;

  if not found then
    raise exception 'Finding domain row not found';
  end if;
  if v_finding.workflow_status <> 'VERIFYING' then
    raise exception 'Finding must be VERIFYING before CAPA escalation';
  end if;

  if exists (
    select 1 from record_links
    where source_record_id = p_finding_record_id
      and relation_type = 'ESCALATED_TO_CAPA'
  ) then
    raise exception 'Finding already escalated to CAPA';
  end if;

  select coalesce(max(verification_no),0) + 1
    into v_verification_no
  from finding_verifications
  where finding_id = v_finding.id;

  insert into finding_verifications(
    finding_id, verification_no, reviewer_user_id, result, comment
  ) values (
    v_finding.id, v_verification_no, p_actor_user_id, 'ESCALATE_CAPA', trim(p_reason)
  );

  select next_record_code('CAPA', v_record.work_year) into v_capa_code;
  if v_capa_code is null then
    raise exception 'Could not allocate CAPA record code';
  end if;

  insert into records(
    organization_id, record_type, record_code, title, work_year,
    owner_department_id, owner_user_id, lifecycle_status, created_by
  ) values (
    v_record.organization_id,
    'CAPA',
    v_capa_code,
    'CAPA từ ' || v_record.record_code || ': ' || v_record.title,
    v_record.work_year,
    coalesce(v_finding.lead_department_id, v_record.owner_department_id),
    coalesce(v_finding.owner_user_id, v_record.owner_user_id),
    'ACTIVE',
    p_actor_user_id
  ) returning id into v_capa_record_id;

  insert into capas(
    record_id, problem_statement, priority, immediate_correction,
    lead_department_id, owner_user_id, workflow_status
  ) values (
    v_capa_record_id,
    v_finding.description,
    p_priority,
    v_finding.immediate_action,
    coalesce(v_finding.lead_department_id, v_record.owner_department_id),
    coalesce(v_finding.owner_user_id, v_record.owner_user_id),
    'DRAFT'
  ) returning id into v_capa_id;

  insert into record_links(
    source_record_id, target_record_id, relation_type, metadata, created_by
  ) values (
    p_finding_record_id,
    v_capa_record_id,
    'ESCALATED_TO_CAPA',
    jsonb_build_object('finding_id', v_finding.id, 'verification_no', v_verification_no),
    p_actor_user_id
  );

  update findings
  set workflow_status = 'ESCALATED_TO_CAPA', updated_at = now()
  where id = v_finding.id;

  insert into audit_logs(
    actor_user_id, record_id, table_name, row_id, action_type,
    old_value, new_value, reason, request_meta
  ) values (
    p_actor_user_id,
    p_finding_record_id,
    'findings',
    v_finding.id,
    'FINDING_ESCALATE_CAPA',
    jsonb_build_object('workflow_status', v_finding.workflow_status),
    jsonb_build_object('workflow_status', 'ESCALATED_TO_CAPA', 'capa_record_id', v_capa_record_id),
    trim(p_reason),
    jsonb_build_object('source', 'qlcl-ui', 'transaction', 'qlcl_escalate_finding_to_capa_v1')
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'ESCALATED_TO_CAPA',
    'capa_record_id', v_capa_record_id,
    'capa_id', v_capa_id,
    'capa_code', v_capa_code,
    'verification_no', v_verification_no
  );
end;
$$;

revoke all on function qlcl_escalate_finding_to_capa_v1(uuid,uuid,text,text) from public;
revoke all on function qlcl_escalate_finding_to_capa_v1(uuid,uuid,text,text) from anon;
revoke all on function qlcl_escalate_finding_to_capa_v1(uuid,uuid,text,text) from authenticated;
grant execute on function qlcl_escalate_finding_to_capa_v1(uuid,uuid,text,text) to service_role;

commit;
