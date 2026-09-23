-- QARICA CAPA start-actions atomic transaction V1.
create or replace function public.qlcl_start_capa_actions_v1(
  p_capa_record_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_capa public.capas%rowtype;
  v_rca public.rca_analyses%rowtype;
  v_corrective integer := 0;
  v_preventive integer := 0;
  v_now timestamptz := now();
begin
  if p_capa_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu CAPA hoặc người thực hiện';
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
    raise exception 'CAPA chưa ở bước lập hành động';
  end if;
  if v_capa.rca_analysis_id is null then
    raise exception 'Phải hoàn tất phân tích nguyên nhân gốc trước';
  end if;

  select * into v_rca
  from public.rca_analyses
  where id=v_capa.rca_analysis_id;

  if not found
     or coalesce(v_rca.status,'') <> 'COMPLETED'
     or nullif(trim(coalesce(v_rca.conclusion,'')),'') is null then
    raise exception 'RCA chưa hoàn tất hoặc chưa có kết luận';
  end if;

  select
    count(*) filter (where upper(coalesce(action_type,''))='CORRECTIVE'),
    count(*) filter (where upper(coalesce(action_type,''))='PREVENTIVE')
  into v_corrective,v_preventive
  from public.capa_action_links
  where capa_id=v_capa.id;

  if v_corrective < 1 then
    raise exception 'CAPA cần ít nhất 01 Corrective Action';
  end if;
  if v_preventive < 1 then
    raise exception 'CAPA cần ít nhất 01 Preventive Action';
  end if;

  update public.capas
  set workflow_status='IN_PROGRESS',
      updated_at=v_now
  where id=v_capa.id
    and workflow_status='ROOT_CAUSE_ANALYSIS';

  if not found then
    raise exception 'Trạng thái CAPA đã thay đổi. Vui lòng tải lại';
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_capa_record_id,'capas',v_capa.id,
    'CAPA_START_ACTIONS',
    jsonb_build_object(
      'workflow_status','ROOT_CAUSE_ANALYSIS',
      'rca_analysis_id',v_capa.rca_analysis_id
    ),
    jsonb_build_object(
      'workflow_status','IN_PROGRESS',
      'corrective_count',v_corrective,
      'preventive_count',v_preventive
    ),
    'CAPA đủ RCA và hành động khắc phục/phòng ngừa để bắt đầu triển khai.',
    jsonb_build_object(
      'source','qlcl-ui',
      'transaction','qlcl_start_capa_actions_v1'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status','IN_PROGRESS',
    'corrective_count',v_corrective,
    'preventive_count',v_preventive,
    'started_at',v_now
  );
end;
$function$;

revoke all on function public.qlcl_start_capa_actions_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.qlcl_start_capa_actions_v1(uuid,uuid)
  to service_role;
