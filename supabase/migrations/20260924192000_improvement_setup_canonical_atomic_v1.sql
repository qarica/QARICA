-- QARICA Improvement SMART/PDSA canonical + atomic setup V1.
-- Production schema is canonical; remove runtime schema probing and close duplicate races.

create unique index if not exists uq_project_objectives_project_normalized_text
on public.project_objectives (
  project_id,
  lower(regexp_replace(btrim(objective_text), '[[:space:]]+', ' ', 'g'))
)
where nullif(btrim(objective_text),'') is not null;

create unique index if not exists uq_project_milestones_project_phase_normalized_title
on public.project_milestones (
  project_id,
  upper(btrim(coalesce(pdsa_phase,''))),
  lower(regexp_replace(btrim(title), '[[:space:]]+', ' ', 'g'))
)
where nullif(btrim(title),'') is not null;

create or replace function public.qlcl_manage_improvement_setup_v1(
  p_record_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_payload jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_project public.improvement_projects%rowtype;
  v_action text := upper(trim(coalesce(p_action,'')));
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_now timestamptz := now();

  v_id uuid;
  v_statement text;
  v_indicator text;
  v_baseline text;
  v_target text;
  v_unit text;
  v_due date;
  v_sequence integer;
  v_old jsonb;
  v_new jsonb;

  v_title text;
  v_phase text;
  v_description text;
  v_start date;
  v_end date;
  v_milestone_status text;
begin
  if p_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu đề án hoặc người thao tác';
  end if;
  if jsonb_typeof(coalesce(p_payload,'{}'::jsonb)) <> 'object' then
    raise exception 'Dữ liệu SMART/PDSA không hợp lệ';
  end if;

  select ip.* into v_project
  from public.improvement_projects ip
  join public.records r on r.id=ip.record_id
  join public.profiles p on p.organization_id=r.organization_id
  where ip.record_id=p_record_id
    and r.record_type='IMPROVEMENT_PROJECT'
    and r.lifecycle_status='ACTIVE'
    and p.user_id=p_actor_user_id
    and p.is_active=true
  for update of ip;

  if not found then
    raise exception 'Đề án không thuộc phạm vi tổ chức hiện tại hoặc đã đóng';
  end if;

  if v_action in ('ADD_OBJECTIVE','UPDATE_OBJECTIVE','DELETE_OBJECTIVE') then
    if upper(coalesce(v_project.workflow_status,'')) <> 'DRAFT' then
      raise exception 'Mục tiêu SMART đã được khóa sau khi đề án rời trạng thái Nháp';
    end if;

    if v_action='DELETE_OBJECTIVE' then
      v_id := nullif(trim(coalesce(p_payload->>'objective_id','')),'')::uuid;
      if v_id is null or v_reason is null then
        raise exception 'Cần chọn mục tiêu và nhập lý do xóa';
      end if;
      select to_jsonb(o) into v_old
      from public.project_objectives o
      where o.id=v_id and o.project_id=v_project.id
      for update;
      if not found then raise exception 'Không tìm thấy mục tiêu SMART trong đề án này'; end if;

      delete from public.project_objectives where id=v_id and project_id=v_project.id;

      insert into public.audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,reason,request_meta)
      values (
        p_actor_user_id,p_record_id,'project_objectives',v_id,'IMPROVEMENT_OBJECTIVE_DELETE',
        v_old,v_reason,jsonb_build_object('source','qlcl-ui','transaction','qlcl_manage_improvement_setup_v1')
      );
      return jsonb_build_object('ok',true,'action',v_action,'id',v_id);
    end if;

    v_statement := trim(coalesce(p_payload->>'statement',''));
    v_indicator := trim(coalesce(p_payload->>'indicator',''));
    v_baseline := trim(coalesce(p_payload->>'baseline',''));
    v_target := trim(coalesce(p_payload->>'target',''));
    v_unit := nullif(trim(coalesce(p_payload->>'unit','')),'');
    v_due := nullif(trim(coalesce(p_payload->>'due_date','')),'')::date;

    if v_statement='' or v_indicator='' or v_baseline='' or v_target='' or v_due is null then
      raise exception 'Mục tiêu SMART cần đủ nội dung, chỉ số đo, baseline, target và hạn đạt';
    end if;
    if v_project.start_date is not null and v_due < v_project.start_date
       or v_project.target_end_date is not null and v_due > v_project.target_end_date then
      raise exception 'Hạn mục tiêu phải nằm trong thời gian thực hiện đề án';
    end if;

    if v_action='ADD_OBJECTIVE' then
      select coalesce(max(sequence_no),0)+1 into v_sequence
      from public.project_objectives where project_id=v_project.id;

      begin
        insert into public.project_objectives(
          project_id,objective_text,sequence_no,indicator_name,baseline_value,target_value,unit,target_date,updated_at
        ) values (
          v_project.id,v_statement,v_sequence,v_indicator,v_baseline,v_target,v_unit,v_due,v_now
        )
        returning id into v_id;
      exception when unique_violation then
        raise exception 'Mục tiêu SMART này đã tồn tại';
      end;

      select to_jsonb(o) into v_new from public.project_objectives o where o.id=v_id;
      insert into public.audit_logs(actor_user_id,record_id,table_name,row_id,action_type,new_value,reason,request_meta)
      values (
        p_actor_user_id,p_record_id,'project_objectives',v_id,'IMPROVEMENT_OBJECTIVE_ADD',
        v_new,coalesce(v_reason,'Thêm mục tiêu SMART.'),
        jsonb_build_object('source','qlcl-ui','transaction','qlcl_manage_improvement_setup_v1')
      );
      return jsonb_build_object('ok',true,'action',v_action,'id',v_id,'sequence_no',v_sequence);
    end if;

    v_id := nullif(trim(coalesce(p_payload->>'objective_id','')),'')::uuid;
    if v_id is null then raise exception 'Thiếu mục tiêu SMART cần sửa'; end if;

    select to_jsonb(o) into v_old
    from public.project_objectives o
    where o.id=v_id and o.project_id=v_project.id
    for update;
    if not found then raise exception 'Không tìm thấy mục tiêu SMART trong đề án này'; end if;

    begin
      update public.project_objectives
      set objective_text=v_statement,
          indicator_name=v_indicator,
          baseline_value=v_baseline,
          target_value=v_target,
          unit=v_unit,
          target_date=v_due,
          updated_at=v_now
      where id=v_id and project_id=v_project.id;
    exception when unique_violation then
      raise exception 'Mục tiêu SMART này đã tồn tại';
    end;

    select to_jsonb(o) into v_new from public.project_objectives o where o.id=v_id;
    insert into public.audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
    values (
      p_actor_user_id,p_record_id,'project_objectives',v_id,'IMPROVEMENT_OBJECTIVE_UPDATE',
      v_old,v_new,coalesce(v_reason,'Chỉnh sửa mục tiêu SMART khi đề án còn Nháp.'),
      jsonb_build_object('source','qlcl-ui','transaction','qlcl_manage_improvement_setup_v1')
    );
    return jsonb_build_object('ok',true,'action',v_action,'id',v_id);
  end if;

  if v_action in ('ADD_MILESTONE','UPDATE_MILESTONE','DELETE_MILESTONE') then
    if v_action='DELETE_MILESTONE' then
      v_id := nullif(trim(coalesce(p_payload->>'milestone_id','')),'')::uuid;
      if v_id is null or v_reason is null then
        raise exception 'Cần chọn milestone và nhập lý do xóa';
      end if;

      select upper(coalesce(m.status,'PLANNED')),to_jsonb(m)
      into v_milestone_status,v_old
      from public.project_milestones m
      where m.id=v_id and m.project_id=v_project.id
      for update;
      if not found then raise exception 'Không tìm thấy milestone trong đề án này'; end if;
      if upper(coalesce(v_project.workflow_status,'')) <> 'DRAFT' or v_milestone_status <> 'PLANNED' then
        raise exception 'Chỉ được xóa milestone còn PLANNED khi đề án đang Nháp';
      end if;

      delete from public.project_milestones where id=v_id and project_id=v_project.id;
      insert into public.audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,reason,request_meta)
      values (
        p_actor_user_id,p_record_id,'project_milestones',v_id,'IMPROVEMENT_MILESTONE_DELETE',
        v_old,v_reason,jsonb_build_object('source','qlcl-ui','transaction','qlcl_manage_improvement_setup_v1')
      );
      return jsonb_build_object('ok',true,'action',v_action,'id',v_id);
    end if;

    v_title := trim(coalesce(p_payload->>'title',''));
    v_phase := upper(trim(coalesce(p_payload->>'phase','')));
    v_description := nullif(trim(coalesce(p_payload->>'description','')),'');
    v_start := nullif(trim(coalesce(p_payload->>'start_date','')),'')::date;
    v_end := nullif(trim(coalesce(p_payload->>'end_date','')),'')::date;

    if v_title='' or v_phase not in ('PLAN','DO','STUDY','ACT') then
      raise exception 'Cần nhập milestone và chọn đúng pha PDSA: PLAN, DO, STUDY hoặc ACT';
    end if;
    if v_start is not null and v_end is not null and v_start>v_end then
      raise exception 'Ngày bắt đầu milestone không được sau ngày kết thúc';
    end if;
    if (v_start is not null and ((v_project.start_date is not null and v_start<v_project.start_date) or (v_project.target_end_date is not null and v_start>v_project.target_end_date)))
       or (v_end is not null and ((v_project.start_date is not null and v_end<v_project.start_date) or (v_project.target_end_date is not null and v_end>v_project.target_end_date))) then
      raise exception 'Thời gian milestone phải nằm trong thời gian thực hiện đề án';
    end if;

    if v_action='ADD_MILESTONE' then
      if upper(coalesce(v_project.workflow_status,'')) not in ('DRAFT','APPROVED','IN_PROGRESS') then
        raise exception 'Milestone/PDSA chỉ được bổ sung khi đề án còn Nháp, đã phê duyệt hoặc đang triển khai';
      end if;
      select coalesce(max(sequence_no),0)+1 into v_sequence
      from public.project_milestones where project_id=v_project.id;

      begin
        insert into public.project_milestones(
          project_id,title,due_date,status,sequence_no,pdsa_phase,description,planned_start_date,planned_end_date,updated_at
        ) values (
          v_project.id,v_title,v_end,'PLANNED',v_sequence,v_phase,v_description,v_start,v_end,v_now
        )
        returning id into v_id;
      exception when unique_violation then
        raise exception 'Milestone này đã tồn tại trong cùng pha PDSA';
      end;

      select to_jsonb(m) into v_new from public.project_milestones m where m.id=v_id;
      insert into public.audit_logs(actor_user_id,record_id,table_name,row_id,action_type,new_value,reason,request_meta)
      values (
        p_actor_user_id,p_record_id,'project_milestones',v_id,'IMPROVEMENT_MILESTONE_ADD',
        v_new,coalesce(v_reason,'Thêm milestone PDSA.'),
        jsonb_build_object('source','qlcl-ui','transaction','qlcl_manage_improvement_setup_v1')
      );
      return jsonb_build_object('ok',true,'action',v_action,'id',v_id,'sequence_no',v_sequence);
    end if;

    v_id := nullif(trim(coalesce(p_payload->>'milestone_id','')),'')::uuid;
    if v_id is null then raise exception 'Thiếu milestone cần sửa'; end if;

    select upper(coalesce(m.status,'PLANNED')),to_jsonb(m)
    into v_milestone_status,v_old
    from public.project_milestones m
    where m.id=v_id and m.project_id=v_project.id
    for update;
    if not found then raise exception 'Không tìm thấy milestone trong đề án này'; end if;
    if upper(coalesce(v_project.workflow_status,'')) not in ('DRAFT','APPROVED','IN_PROGRESS') or v_milestone_status <> 'PLANNED' then
      raise exception 'Chỉ được sửa milestone còn PLANNED khi đề án đang Nháp, đã phê duyệt hoặc đang triển khai';
    end if;

    begin
      update public.project_milestones
      set title=v_title,
          due_date=v_end,
          pdsa_phase=v_phase,
          description=v_description,
          planned_start_date=v_start,
          planned_end_date=v_end,
          updated_at=v_now
      where id=v_id and project_id=v_project.id;
    exception when unique_violation then
      raise exception 'Milestone này đã tồn tại trong cùng pha PDSA';
    end;

    select to_jsonb(m) into v_new from public.project_milestones m where m.id=v_id;
    insert into public.audit_logs(actor_user_id,record_id,table_name,row_id,action_type,old_value,new_value,reason,request_meta)
    values (
      p_actor_user_id,p_record_id,'project_milestones',v_id,'IMPROVEMENT_MILESTONE_UPDATE',
      v_old,v_new,coalesce(v_reason,'Chỉnh sửa milestone PDSA còn PLANNED.'),
      jsonb_build_object('source','qlcl-ui','transaction','qlcl_manage_improvement_setup_v1')
    );
    return jsonb_build_object('ok',true,'action',v_action,'id',v_id);
  end if;

  raise exception 'Thao tác SMART/PDSA không hợp lệ';
end;
$function$;

revoke all on function public.qlcl_manage_improvement_setup_v1(uuid,uuid,text,jsonb,text)
from public,anon,authenticated;
grant execute on function public.qlcl_manage_improvement_setup_v1(uuid,uuid,text,jsonb,text)
to service_role;
