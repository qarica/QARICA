-- QARICA CAPA RCA save atomic transaction V1.
create or replace function public.qlcl_save_capa_rca_v1(
  p_capa_record_id uuid,
  p_actor_user_id uuid,
  p_method text,
  p_conclusion text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_capa public.capas%rowtype;
  v_method text := trim(coalesce(p_method,''));
  v_conclusion text := trim(coalesce(p_conclusion,''));
  v_now timestamptz := now();
  v_rca_id uuid;
  v_created boolean := false;
begin
  if p_capa_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu CAPA hoặc người thực hiện';
  end if;
  if v_method='' or v_conclusion='' then
    raise exception 'Phương pháp và kết luận nguyên nhân gốc là bắt buộc';
  end if;

  select c.* into v_capa
  from public.capas c
  join public.records r on r.id=c.record_id
  join public.profiles p on p.organization_id=r.organization_id
  where c.record_id=p_capa_record_id
    and p.user_id=p_actor_user_id
    and p.is_active=true
    and r.lifecycle_status='ACTIVE'
  for update of c;

  if not found then
    raise exception 'Không tìm thấy CAPA hoạt động hoặc ngoài phạm vi tổ chức';
  end if;
  if v_capa.workflow_status <> 'ROOT_CAUSE_ANALYSIS' then
    raise exception 'CAPA không ở bước phân tích nguyên nhân';
  end if;

  v_rca_id := v_capa.rca_analysis_id;

  if v_rca_id is not null then
    update public.rca_analyses
    set method=v_method,
        status='COMPLETED',
        started_at=coalesce(started_at,v_now),
        completed_at=v_now,
        conclusion=v_conclusion
    where id=v_rca_id;

    if not found then
      raise exception 'Không tìm thấy RCA đã liên kết với CAPA';
    end if;
  else
    insert into public.rca_analyses(
      method,status,started_at,completed_at,conclusion
    ) values (
      v_method,'COMPLETED',v_now,v_now,v_conclusion
    )
    returning id into v_rca_id;

    update public.capas
    set rca_analysis_id=v_rca_id,
        updated_at=v_now
    where id=v_capa.id
      and rca_analysis_id is null;

    if not found then
      raise exception 'Liên kết RCA của CAPA đã thay đổi. Vui lòng tải lại';
    end if;
    v_created:=true;
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_capa_record_id,'capas',v_capa.id,
    'CAPA_SAVE_RCA',
    jsonb_build_object(
      'workflow_status',v_capa.workflow_status,
      'rca_analysis_id',v_capa.rca_analysis_id
    ),
    jsonb_build_object(
      'workflow_status','ROOT_CAUSE_ANALYSIS',
      'rca_analysis_id',v_rca_id,
      'method',v_method,
      'status','COMPLETED',
      'created',v_created
    ),
    'Hoàn tất phân tích nguyên nhân gốc cho CAPA.',
    jsonb_build_object(
      'source','qlcl-ui',
      'transaction','qlcl_save_capa_rca_v1'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status','ROOT_CAUSE_ANALYSIS',
    'rca_analysis_id',v_rca_id,
    'method',v_method,
    'created',v_created,
    'completed_at',v_now
  );
end;
$function$;

revoke all on function public.qlcl_save_capa_rca_v1(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_save_capa_rca_v1(uuid,uuid,text,text)
  to service_role;
