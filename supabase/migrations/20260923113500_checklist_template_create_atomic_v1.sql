-- QARICA checklist template creation atomic transaction V1.
create or replace function public.qlcl_create_checklist_template_v1(
  p_actor_user_id uuid,
  p_name text,
  p_description text,
  p_source_code text,
  p_owner_department_id uuid,
  p_scoring_method text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_name text := trim(coalesce(p_name,''));
  v_source_code text := nullif(upper(trim(coalesce(p_source_code,''))),'');
  v_scoring text := upper(trim(coalesce(p_scoring_method,'COMPLIANCE_PERCENTAGE')));
  v_code text;
  v_template_id uuid;
  v_version_id uuid;
  v_now timestamptz := now();
  v_work_year integer := extract(year from (v_now at time zone 'Asia/Ho_Chi_Minh'))::integer;
begin
  if p_actor_user_id is null then
    raise exception 'Thiếu người tạo mẫu';
  end if;
  if v_name = '' then
    raise exception 'Tên mẫu bảng kiểm là bắt buộc';
  end if;
  if p_owner_department_id is null then
    raise exception 'Cần chọn khoa/phòng quản lý mẫu';
  end if;
  if v_scoring not in ('NO_SCORE','COMPLIANCE_PERCENTAGE','WEIGHTED_SCORE') then
    raise exception 'Phương pháp tính kết quả không hợp lệ';
  end if;

  select organization_id into v_org
  from public.profiles
  where user_id=p_actor_user_id and is_active=true;

  if v_org is null then
    raise exception 'Tài khoản không hợp lệ hoặc chưa gắn tổ chức';
  end if;

  if not exists (
    select 1 from public.departments d
    where d.id=p_owner_department_id
      and d.organization_id=v_org
      and d.is_active=true
  ) then
    raise exception 'Khoa/phòng quản lý mẫu không hợp lệ hoặc đã ngưng hoạt động';
  end if;

  v_code := public.qlcl_next_master_code_v1(v_org,'CHECKLIST',v_work_year);

  insert into public.checklist_templates(
    organization_id,code,source_code,code_scheme_version,name,description,
    owner_department_id,is_active,created_by,created_at,updated_at
  ) values (
    v_org,v_code,v_source_code,2,v_name,nullif(trim(coalesce(p_description,'')),''),
    p_owner_department_id,true,p_actor_user_id,v_now,v_now
  )
  returning id into v_template_id;

  insert into public.checklist_versions(
    checklist_template_id,version_no,status,scoring_method,created_at
  ) values (
    v_template_id,1,'DRAFT',v_scoring,v_now
  )
  returning id into v_version_id;

  insert into public.audit_logs(
    actor_user_id,table_name,row_id,action_type,new_value,reason,request_meta
  ) values (
    p_actor_user_id,
    'checklist_templates',
    v_template_id,
    'CHECKLIST_TEMPLATE_CREATE',
    jsonb_build_object(
      'code',v_code,
      'name',v_name,
      'version_id',v_version_id,
      'version_no',1,
      'version_status','DRAFT',
      'owner_department_id',p_owner_department_id,
      'scoring_method',v_scoring
    ),
    'Tạo mẫu bảng kiểm và phiên bản Nháp đầu tiên.',
    jsonb_build_object(
      'source','qlcl-ui',
      'transaction','qlcl_create_checklist_template_v1'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'id',v_template_id,
    'code',v_code,
    'name',v_name,
    'version_id',v_version_id,
    'version_no',1,
    'status','DRAFT'
  );
end;
$function$;

revoke all on function public.qlcl_create_checklist_template_v1(uuid,text,text,text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_create_checklist_template_v1(uuid,text,text,text,uuid,text)
  to service_role;
