-- Finalize assessment rounds atomically and reconcile legacy lifecycle drift.
create or replace function public.qlcl_finalize_assessment_round_v1(
  p_round_id uuid,
  p_record_id uuid,
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_record public.records%rowtype;
  v_round public.assessment_rounds%rowtype;
  v_required_count integer := 0;
  v_final_count integer := 0;
  v_now timestamptz := now();
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Kết luận chốt đợt là bắt buộc.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.user_id = p_actor_user_id
      and p.organization_id = p_organization_id
      and p.is_active
  ) then
    raise exception 'Người thực hiện không thuộc đơn vị hiện tại hoặc đã ngưng hoạt động.';
  end if;

  select *
  into v_record
  from public.records r
  where r.id = p_record_id
    and r.record_type = 'ASSESSMENT'
    and r.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Không tìm thấy đợt tự đánh giá trong phạm vi đơn vị hiện tại.';
  end if;

  if v_record.lifecycle_status <> 'ACTIVE' then
    raise exception 'Đợt tự đánh giá đã đóng hoặc không còn ở trạng thái hoạt động.';
  end if;

  select *
  into v_round
  from public.assessment_rounds ar
  where ar.id = p_round_id
    and ar.record_id = p_record_id
  for update;

  if not found or v_round.workflow_status <> 'REVIEWING' then
    raise exception 'Đợt chưa ở giai đoạn rà soát để chốt.';
  end if;

  select count(*)
  into v_required_count
  from public.assessment_round_criteria arc
  where arc.assessment_round_id = p_round_id
    and coalesce(arc.applicability_status, 'APPLICABLE') = 'APPLICABLE';

  select count(distinct ca.criteria_item_id)
  into v_final_count
  from public.criterion_assessments ca
  where ca.assessment_round_id = p_round_id
    and ca.workflow_status in ('REVIEWED','FINALIZED','COMPLETED','APPROVED')
    and exists (
      select 1
      from public.assessment_round_criteria arc
      where arc.assessment_round_id = p_round_id
        and coalesce(arc.applicability_status, 'APPLICABLE') = 'APPLICABLE'
        and coalesce(arc.criteria_item_id, arc.criterion_id) = ca.criteria_item_id
    );

  if v_final_count < v_required_count then
    raise exception 'Mới có %/% tiêu chí áp dụng được rà soát; chưa đủ để chốt đợt.', v_final_count, v_required_count;
  end if;

  update public.criterion_assessments ca
  set workflow_status = 'FINALIZED',
      updated_at = v_now
  where ca.assessment_round_id = p_round_id
    and exists (
      select 1
      from public.assessment_round_criteria arc
      where arc.assessment_round_id = p_round_id
        and coalesce(arc.applicability_status, 'APPLICABLE') = 'APPLICABLE'
        and coalesce(arc.criteria_item_id, arc.criterion_id) = ca.criteria_item_id
    );

  update public.records
  set lifecycle_status = 'CLOSED',
      closed_at = coalesce(closed_at, v_now),
      updated_at = v_now
  where id = p_record_id
    and organization_id = p_organization_id;

  insert into public.record_status_history(
    record_id, old_status, new_status, changed_by, reason
  ) values (
    p_record_id, v_record.lifecycle_status, 'CLOSED', p_actor_user_id, p_reason
  );

  update public.assessment_rounds
  set workflow_status = 'FINALIZED',
      updated_at = v_now
  where id = p_round_id
    and record_id = p_record_id;

  insert into public.audit_logs(
    actor_user_id, record_id, table_name, row_id, action_type,
    old_value, new_value, reason, request_meta
  ) values (
    p_actor_user_id, p_record_id, 'assessment_rounds', p_round_id,
    'ASSESSMENT_FINALIZE',
    jsonb_build_object('workflow_status', v_round.workflow_status, 'record_lifecycle_status', v_record.lifecycle_status),
    jsonb_build_object('workflow_status', 'FINALIZED', 'record_lifecycle_status', 'CLOSED'),
    p_reason,
    jsonb_build_object('source', 'qlcl-ui', 'atomic', true)
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'FINALIZED',
    'required_count', v_required_count,
    'finalized_count', v_final_count
  );
end;
$$;

revoke execute on function public.qlcl_finalize_assessment_round_v1(uuid,uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.qlcl_finalize_assessment_round_v1(uuid,uuid,uuid,uuid,text) to service_role;

-- Reconcile only legacy assessment records that are still ACTIVE although their round is already FINALIZED.
insert into public.record_status_history(record_id, old_status, new_status, changed_by, reason)
select r.id, r.lifecycle_status, 'CLOSED', null,
       'System reconciliation: assessment round was already FINALIZED before atomic finalize gate.'
from public.records r
where r.record_type = 'ASSESSMENT'
  and r.lifecycle_status = 'ACTIVE'
  and exists (
    select 1 from public.assessment_rounds ar
    where ar.record_id = r.id and ar.workflow_status = 'FINALIZED'
  )
  and not exists (
    select 1 from public.record_status_history h
    where h.record_id = r.id and h.new_status = 'CLOSED'
  );

insert into public.audit_logs(
  actor_user_id, record_id, table_name, row_id, action_type,
  old_value, new_value, reason, request_meta
)
select null, r.id, 'records', r.id, 'ASSESSMENT_LIFECYCLE_RECONCILE',
       jsonb_build_object('lifecycle_status', r.lifecycle_status),
       jsonb_build_object('lifecycle_status', 'CLOSED'),
       'Reconcile FINALIZED assessment round with parent record lifecycle.',
       jsonb_build_object('source', 'migration', 'atomic_finalize_repair', true)
from public.records r
where r.record_type = 'ASSESSMENT'
  and r.lifecycle_status = 'ACTIVE'
  and exists (
    select 1 from public.assessment_rounds ar
    where ar.record_id = r.id and ar.workflow_status = 'FINALIZED'
  );

update public.records r
set lifecycle_status = 'CLOSED',
    closed_at = coalesce(
      r.closed_at,
      (select max(ar.updated_at) from public.assessment_rounds ar where ar.record_id = r.id and ar.workflow_status = 'FINALIZED'),
      now()
    ),
    updated_at = now()
where r.record_type = 'ASSESSMENT'
  and r.lifecycle_status = 'ACTIVE'
  and exists (
    select 1 from public.assessment_rounds ar
    where ar.record_id = r.id and ar.workflow_status = 'FINALIZED'
  );
