-- QARICA Assessment START/SUBMIT_REVIEW atomic transition V1.
create or replace function public.qlcl_transition_assessment_round_v1(
  p_record_id uuid,
  p_actor_user_id uuid,
  p_command text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_round public.assessment_rounds%rowtype;
  v_org uuid;
  v_command text := upper(trim(coalesce(p_command,'')));
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_now timestamptz := now();
  v_effective_date date;
  v_scope integer := 0;
  v_applicable integer := 0;
  v_not_applicable integer := 0;
  v_invalid_na integer := 0;
  v_missing_lead integer := 0;
  v_required integer := 0;
  v_done integer := 0;
  v_new_status text;
begin
  if p_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu đợt tự đánh giá hoặc người thực hiện';
  end if;
  if v_command not in ('START','SUBMIT_REVIEW') then
    raise exception 'Thao tác tự đánh giá không hợp lệ';
  end if;

  select r.organization_id into v_org
  from public.records r
  join public.profiles p on p.organization_id=r.organization_id
  where r.id=p_record_id
    and r.record_type='ASSESSMENT'
    and r.lifecycle_status='ACTIVE'
    and p.user_id=p_actor_user_id
    and p.is_active=true;

  if v_org is null then
    raise exception 'Không tìm thấy đợt tự đánh giá trong phạm vi tổ chức';
  end if;

  select ar.* into v_round
  from public.assessment_rounds ar
  where ar.record_id=p_record_id
  for update;

  if not found then
    raise exception 'Không tìm thấy dữ liệu đợt đánh giá';
  end if;

  if v_command='START' then
    if v_round.workflow_status <> 'DRAFT' then
      raise exception 'Chỉ đợt nháp mới được bắt đầu';
    end if;

    select
      count(*),
      count(*) filter (where coalesce(applicability_status,'APPLICABLE')='APPLICABLE'),
      count(*) filter (where applicability_status='NOT_APPLICABLE'),
      count(*) filter (
        where applicability_status='NOT_APPLICABLE'
          and nullif(trim(coalesce(not_applicable_reason,'')),'') is null
      )
    into v_scope,v_applicable,v_not_applicable,v_invalid_na
    from public.assessment_round_criteria
    where assessment_round_id=v_round.id;

    if v_scope < 1 then
      raise exception 'Đợt đánh giá chưa có tiêu chí trong phạm vi';
    end if;
    if v_invalid_na > 0 then
      raise exception '% tiêu chí Không áp dụng chưa có lý do',v_invalid_na;
    end if;

    v_effective_date := coalesce(v_round.start_date,make_date(v_round.work_year,1,1));

    if v_round.criteria_version_id is not null then
      update public.assessment_round_criteria arc
      set lead_department_id=cr.lead_department_id,
          support_department_ids=coalesce(cr.support_department_ids,'{}'::uuid[]),
          responsibility_source_id=cr.id,
          responsibility_snapshot_at=v_now
      from public.criterion_responsibilities cr
      where arc.assessment_round_id=v_round.id
        and coalesce(arc.applicability_status,'APPLICABLE')='APPLICABLE'
        and arc.lead_department_id is null
        and cr.organization_id=v_org
        and cr.criteria_version_id=v_round.criteria_version_id
        and cr.criteria_item_id=coalesce(arc.criteria_item_id,arc.criterion_id)
        and (cr.effective_from is null or cr.effective_from<=v_effective_date)
        and (cr.effective_to is null or cr.effective_to>=v_effective_date);
    end if;

    select count(*) into v_missing_lead
    from public.assessment_round_criteria
    where assessment_round_id=v_round.id
      and coalesce(applicability_status,'APPLICABLE')='APPLICABLE'
      and lead_department_id is null;

    if v_missing_lead > 0 then
      raise exception '% tiêu chí áp dụng chưa có đơn vị phụ trách',v_missing_lead;
    end if;

    v_new_status:='IN_PROGRESS';

  else
    if v_round.workflow_status <> 'IN_PROGRESS' then
      raise exception 'Đợt chưa ở giai đoạn đơn vị đánh giá';
    end if;

    select count(distinct coalesce(criteria_item_id,criterion_id))
    into v_required
    from public.assessment_round_criteria
    where assessment_round_id=v_round.id
      and coalesce(applicability_status,'APPLICABLE')='APPLICABLE';

    select count(distinct ca.criteria_item_id)
    into v_done
    from public.criterion_assessments ca
    where ca.assessment_round_id=v_round.id
      and ca.workflow_status in ('SUBMITTED','REVIEWED','FINALIZED','COMPLETED','APPROVED')
      and exists (
        select 1
        from public.assessment_round_criteria arc
        where arc.assessment_round_id=v_round.id
          and coalesce(arc.applicability_status,'APPLICABLE')='APPLICABLE'
          and coalesce(arc.criteria_item_id,arc.criterion_id)=ca.criteria_item_id
      );

    if v_done < v_required then
      raise exception 'Mới có %/% tiêu chí áp dụng được gửi; chưa đủ để rà soát',v_done,v_required;
    end if;

    v_new_status:='REVIEWING';
  end if;

  update public.assessment_rounds
  set workflow_status=v_new_status,
      updated_at=v_now
  where id=v_round.id
    and workflow_status=v_round.workflow_status;

  if not found then
    raise exception 'Trạng thái đợt đánh giá đã thay đổi. Vui lòng tải lại';
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_record_id,'assessment_rounds',v_round.id,
    'ASSESSMENT_'||v_command,
    jsonb_build_object('workflow_status',v_round.workflow_status),
    jsonb_build_object(
      'workflow_status',v_new_status,
      'scope_count',case when v_command='START' then v_scope else null end,
      'applicable_count',case when v_command='START' then v_applicable else null end,
      'not_applicable_count',case when v_command='START' then v_not_applicable else null end,
      'required_count',case when v_command='SUBMIT_REVIEW' then v_required else null end,
      'submitted_count',case when v_command='SUBMIT_REVIEW' then v_done else null end
    ),
    v_reason,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_transition_assessment_round_v1','command',v_command)
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status',v_new_status,
    'scope',v_scope,
    'applicable',v_applicable,
    'not_applicable',v_not_applicable,
    'invalid_na',v_invalid_na,
    'missing_lead',v_missing_lead,
    'required',v_required,
    'submitted',v_done
  );
end;
$function$;

revoke all on function public.qlcl_transition_assessment_round_v1(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_transition_assessment_round_v1(uuid,uuid,text,text)
  to service_role;
