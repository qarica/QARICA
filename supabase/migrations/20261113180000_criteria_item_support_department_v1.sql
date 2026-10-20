-- Phản hồi thực tế: "Đã thêm được phụ trách chính chưa thêm được hỗ trợ" —
-- criteria_items chỉ có owner_department_id (1 khoa/phòng phụ trách chính,
-- thêm ở 20260927_criteria_item_owner_department_v1.sql). Thêm
-- support_department_ids (uuid[], nhiều khoa/phòng hỗ trợ, không bắt buộc)
-- theo đúng hướng đã chọn: mở rộng Bộ tiêu chí, cùng vòng đời với
-- owner_department_id, KHÔNG dùng bảng criterion_responsibilities có sẵn
-- (bảng đó theo năm làm việc, có quy trình xác nhận riêng, nhưng chưa từng
-- được API/UI nào dùng tới — ngoài phạm vi đợt sửa lỗi này).

alter table public.criteria_items
  add column if not exists support_department_ids uuid[] not null default '{}'::uuid[];

create index if not exists idx_criteria_items_support_department
  on public.criteria_items using gin(support_department_ids);

-- CREATE OR REPLACE không đổi được danh sách tham số; xoá overload 15 tham số
-- cũ để không còn đường tạo tiêu chí nào bỏ qua kiểm tra khoa/phòng hỗ trợ.
drop function if exists public.qlcl_create_criteria_item_v1(uuid,uuid,text,text,text,uuid,text,integer,text,text,integer,boolean,boolean,numeric,uuid);

create or replace function public.qlcl_create_criteria_item_v1(
  p_actor_user_id uuid,
  p_criteria_set_id uuid,
  p_title text,
  p_code text,
  p_description text,
  p_parent_criteria_item_id uuid,
  p_requested_item_type text,
  p_sequence_no integer,
  p_chapter_code text,
  p_chapter_name text,
  p_score_weight integer,
  p_is_core boolean,
  p_is_mandatory boolean,
  p_max_score numeric,
  p_owner_department_id uuid default null,
  p_support_department_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor public.profiles%rowtype;
  v_set public.criteria_sets%rowtype;
  v_version public.criteria_set_versions%rowtype;
  v_parent public.criteria_items%rowtype;
  v_department public.departments%rowtype;
  v_title text := trim(coalesce(p_title,''));
  v_code text := nullif(upper(trim(coalesce(p_code,''))),'');
  v_item_type text;
  v_sequence integer;
  v_item_id uuid;
  v_now timestamptz := now();
  v_support_department_ids uuid[] := coalesce(p_support_department_ids,'{}'::uuid[]);
  v_invalid_support_count integer;
begin
  select * into v_actor
  from public.profiles
  where user_id=p_actor_user_id and is_active=true;

  if not found or v_actor.organization_id is null then
    raise exception 'Tài khoản không hợp lệ hoặc chưa gắn tổ chức.';
  end if;
  if v_title='' then raise exception 'Tên tiêu chí/tiểu mục là bắt buộc.'; end if;
  if p_owner_department_id is null then raise exception 'Khoa/phòng phụ trách tiêu chí là bắt buộc.'; end if;

  select * into v_department
  from public.departments
  where id=p_owner_department_id
    and organization_id=v_actor.organization_id
    and is_active=true;
  if not found then raise exception 'Khoa/phòng phụ trách không hợp lệ.'; end if;

  if array_length(v_support_department_ids,1) > 0 then
    select count(*) into v_invalid_support_count
    from unnest(v_support_department_ids) sid
    where not exists(
      select 1 from public.departments d
      where d.id=sid and d.organization_id=v_actor.organization_id and d.is_active=true
    );
    if v_invalid_support_count > 0 then
      raise exception 'Một hoặc nhiều khoa/phòng hỗ trợ không hợp lệ.';
    end if;
  end if;

  select * into v_set
  from public.criteria_sets
  where id=p_criteria_set_id
    and organization_id=v_actor.organization_id
  for update;

  if not found then raise exception 'Không tìm thấy bộ tiêu chí trong tổ chức hiện tại.'; end if;
  if not v_set.is_active then raise exception 'Bộ tiêu chí đã ngưng áp dụng.'; end if;

  select * into v_version
  from public.criteria_set_versions
  where criteria_set_id=v_set.id and status='DRAFT'
  order by version_no desc
  limit 1
  for update;

  if not found then
    raise exception 'Bộ tiêu chí chưa có phiên bản Nháp để chỉnh sửa.';
  end if;

  if p_parent_criteria_item_id is not null then
    select * into v_parent
    from public.criteria_items
    where id=p_parent_criteria_item_id
    for update;
    if not found
       or v_parent.criteria_version_id<>v_version.id
       or v_parent.parent_criteria_item_id is not null then
      raise exception 'Tiêu chí cha không hợp lệ; tiểu mục chỉ được nằm dưới một tiêu chí cấp 1.';
    end if;
    if not v_parent.is_active then raise exception 'Tiêu chí cha đã ngưng áp dụng.'; end if;
    v_item_type:='SUBITEM';
  else
    v_item_type:=case
      when upper(trim(coalesce(p_requested_item_type,''))) in ('CRITERION','GROUP')
        then upper(trim(p_requested_item_type))
      else 'CRITERION'
    end;
  end if;

  if v_code is not null and exists (
    select 1 from public.criteria_items
    where criteria_version_id=v_version.id
      and upper(trim(coalesce(code,'')))=upper(trim(v_code))
  ) then
    raise exception 'Mã tiêu chí đã tồn tại trong phiên bản này.';
  end if;

  if coalesce(p_sequence_no,0)>0 then
    v_sequence:=p_sequence_no;
  else
    select coalesce(max(sequence_no),0)+10 into v_sequence
    from public.criteria_items
    where criteria_version_id=v_version.id
      and parent_criteria_item_id is not distinct from p_parent_criteria_item_id;
  end if;

  insert into public.criteria_items(
    criteria_version_id,code,title,description,sequence_no,
    chapter_code,chapter_name,score_weight,is_core,is_mandatory,max_score,
    parent_criteria_item_id,item_type,owner_department_id,support_department_ids,is_active,created_at,updated_at
  ) values (
    v_version.id,v_code,v_title,nullif(trim(coalesce(p_description,'')),''),
    v_sequence,nullif(trim(coalesce(p_chapter_code,'')),''),
    nullif(trim(coalesce(p_chapter_name,'')),''),
    greatest(1,coalesce(p_score_weight,1)),
    coalesce(p_is_core,false),coalesce(p_is_mandatory,false),p_max_score,
    p_parent_criteria_item_id,v_item_type,p_owner_department_id,v_support_department_ids,true,v_now,v_now
  )
  returning id into v_item_id;

  insert into public.audit_logs(
    actor_user_id,table_name,row_id,action_type,new_value,reason,request_meta
  ) values (
    p_actor_user_id,'criteria_items',v_item_id,'CRITERIA_ITEM_CREATE',
    jsonb_build_object(
      'criteria_set_id',v_set.id,'criteria_version_id',v_version.id,
      'version_no',v_version.version_no,'code',v_code,'title',v_title,
      'parent_criteria_item_id',p_parent_criteria_item_id,
      'item_type',v_item_type,'sequence_no',v_sequence,
      'owner_department_id',p_owner_department_id,
      'support_department_ids',to_jsonb(v_support_department_ids)
    ),
    'Tạo tiêu chí/tiểu mục trong phiên bản Nháp.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_create_criteria_item_v1')
  );

  return jsonb_build_object(
    'ok',true,'id',v_item_id,'code',v_code,'title',v_title,
    'parent_criteria_item_id',p_parent_criteria_item_id,
    'item_type',v_item_type,'sequence_no',v_sequence,
    'owner_department_id',p_owner_department_id,
    'support_department_ids',to_jsonb(v_support_department_ids),
    'criteria_version_id',v_version.id,'version_no',v_version.version_no
  );
end;
$function$;

revoke all on function public.qlcl_create_criteria_item_v1(uuid,uuid,text,text,text,uuid,text,integer,text,text,integer,boolean,boolean,numeric,uuid,uuid[])
  from public,anon,authenticated;
grant execute on function public.qlcl_create_criteria_item_v1(uuid,uuid,text,text,text,uuid,text,integer,text,text,integer,boolean,boolean,numeric,uuid,uuid[])
  to service_role;

-- Sao chép support_department_ids khi nhân bản sang phiên bản Nháp mới, cùng
-- cách owner_department_id đã được sao chép (chữ ký hàm không đổi).
create or replace function public.qlcl_create_criteria_revision_v1(
  p_actor_user_id uuid,
  p_criteria_set_id uuid,
  p_effective_from date
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor public.profiles%rowtype;
  v_set public.criteria_sets%rowtype;
  v_existing public.criteria_set_versions%rowtype;
  v_source public.criteria_set_versions%rowtype;
  v_new_version_id uuid;
  v_new_version_no integer;
  v_item record;
  v_new_item_id uuid;
  v_id_map jsonb := '{}'::jsonb;
  v_cloned integer := 0;
  v_now timestamptz := now();
begin
  select * into v_actor
  from public.profiles
  where user_id=p_actor_user_id and is_active=true;

  if not found or v_actor.organization_id is null then
    raise exception 'Tài khoản không hợp lệ hoặc chưa gắn tổ chức.';
  end if;

  select * into v_set
  from public.criteria_sets
  where id=p_criteria_set_id
    and organization_id=v_actor.organization_id
  for update;

  if not found then raise exception 'Không tìm thấy bộ tiêu chí trong tổ chức hiện tại.'; end if;
  if not v_set.is_active then raise exception 'Bộ tiêu chí đã ngưng áp dụng.'; end if;

  select * into v_existing
  from public.criteria_set_versions
  where criteria_set_id=v_set.id and status='DRAFT'
  order by version_no desc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'ok',true,'existing',true,'version_id',v_existing.id,
      'version_no',v_existing.version_no,'cloned_items',0
    );
  end if;

  select * into v_source
  from public.criteria_set_versions
  where criteria_set_id=v_set.id
  order by version_no desc
  limit 1
  for update;

  if not found then raise exception 'Bộ tiêu chí chưa có phiên bản nguồn.'; end if;

  select coalesce(max(version_no),0)+1 into v_new_version_no
  from public.criteria_set_versions
  where criteria_set_id=v_set.id;

  insert into public.criteria_set_versions(
    criteria_set_id,version_no,status,effective_from,created_at,updated_at
  ) values (
    v_set.id,v_new_version_no,'DRAFT',p_effective_from,v_now,v_now
  )
  returning id into v_new_version_id;

  for v_item in
    select * from public.criteria_items
    where criteria_version_id=v_source.id
      and parent_criteria_item_id is null
    order by sequence_no,id
  loop
    insert into public.criteria_items(
      criteria_version_id,code,title,description,sequence_no,
      chapter_code,chapter_name,score_weight,is_core,is_mandatory,max_score,
      parent_criteria_item_id,item_type,owner_department_id,support_department_ids,is_active,created_at,updated_at
    ) values (
      v_new_version_id,v_item.code,v_item.title,v_item.description,v_item.sequence_no,
      v_item.chapter_code,v_item.chapter_name,v_item.score_weight,v_item.is_core,
      v_item.is_mandatory,v_item.max_score,null,
      coalesce(v_item.item_type,'CRITERION'),v_item.owner_department_id,
      coalesce(v_item.support_department_ids,'{}'::uuid[]),v_item.is_active,v_now,v_now
    )
    returning id into v_new_item_id;
    v_id_map:=v_id_map||jsonb_build_object(v_item.id::text,v_new_item_id::text);
    v_cloned:=v_cloned+1;
  end loop;

  for v_item in
    select * from public.criteria_items
    where criteria_version_id=v_source.id
      and parent_criteria_item_id is not null
    order by sequence_no,id
  loop
    if not (v_id_map ? v_item.parent_criteria_item_id::text) then
      raise exception 'Không sao chép được cấu trúc cha/con của tiêu chí.';
    end if;

    insert into public.criteria_items(
      criteria_version_id,code,title,description,sequence_no,
      chapter_code,chapter_name,score_weight,is_core,is_mandatory,max_score,
      parent_criteria_item_id,item_type,owner_department_id,support_department_ids,is_active,created_at,updated_at
    ) values (
      v_new_version_id,v_item.code,v_item.title,v_item.description,v_item.sequence_no,
      v_item.chapter_code,v_item.chapter_name,v_item.score_weight,v_item.is_core,
      v_item.is_mandatory,v_item.max_score,
      (v_id_map->>v_item.parent_criteria_item_id::text)::uuid,
      coalesce(v_item.item_type,'SUBITEM'),v_item.owner_department_id,
      coalesce(v_item.support_department_ids,'{}'::uuid[]),v_item.is_active,v_now,v_now
    )
    returning id into v_new_item_id;
    v_id_map:=v_id_map||jsonb_build_object(v_item.id::text,v_new_item_id::text);
    v_cloned:=v_cloned+1;
  end loop;

  insert into public.audit_logs(
    actor_user_id,table_name,row_id,action_type,new_value,reason,request_meta
  ) values (
    p_actor_user_id,'criteria_set_versions',v_new_version_id,'CRITERIA_VERSION_CREATE',
    jsonb_build_object(
      'criteria_set_id',v_set.id,'source_version_id',v_source.id,
      'version_no',v_new_version_no,'status','DRAFT',
      'effective_from',p_effective_from,'cloned_items',v_cloned
    ),
    'Tạo bản cập nhật Nháp từ phiên bản gần nhất.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_create_criteria_revision_v1')
  );

  return jsonb_build_object(
    'ok',true,'existing',false,'version_id',v_new_version_id,
    'version_no',v_new_version_no,'cloned_items',v_cloned
  );
end;
$function$;

-- Seed phạm vi đợt từ Bộ tiêu chí: copy thêm support_department_ids (chữ ký
-- hàm không đổi so với 20261113_assessment_round_lead_department_seed_v1.sql).
create or replace function public.qlcl_create_domain_record_v1(
  p_actor_user_id uuid,
  p_record_type text,
  p_title text,
  p_work_year integer,
  p_owner_department_id uuid,
  p_owner_user_id uuid,
  p_fields jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_actor_name text;
  v_primary_department_id uuid;
  v_type text := upper(trim(coalesce(p_record_type,'')));
  v_title text := trim(coalesce(p_title,''));
  v_fields jsonb := coalesce(p_fields,'{}'::jsonb);
  v_owner_department_id uuid := p_owner_department_id;
  v_owner_user_id uuid := p_owner_user_id;
  v_code text;
  v_record_id uuid;
  v_domain_id uuid;
  v_now timestamptz := now();
  v_assignment public.indicator_assignments%rowtype;
  v_version public.criteria_set_versions%rowtype;
  v_reporter_department_id uuid;
  v_on_behalf_department_id uuid;
  v_reporter_name text;
  v_reporter_department_name text;
  v_method text;
begin
  if p_actor_user_id is null then raise exception 'Thiếu người tạo hồ sơ'; end if;
  if v_title='' then raise exception 'Tên hồ sơ là bắt buộc'; end if;
  if p_work_year < 2000 or p_work_year > 2200 then raise exception 'Năm làm việc không hợp lệ'; end if;
  if v_type not in (
    'DIRECTIVE','REPORT','INSPECTION','INDICATOR_MEASUREMENT','FINDING','INCIDENT','CAPA',
    'RISK','FMEA','IMPROVEMENT_PROPOSAL','IMPROVEMENT_PROJECT','ASSESSMENT',
    'EXTERNAL_ASSESSMENT','AUDIT','SAFETY_ALERT','FEEDBACK'
  ) then raise exception 'Loại hồ sơ chưa hỗ trợ'; end if;

  select organization_id,full_name,primary_department_id
  into v_org,v_actor_name,v_primary_department_id
  from public.profiles
  where user_id=p_actor_user_id and is_active=true;

  if v_org is null then raise exception 'Tài khoản chưa gắn tổ chức hoặc đã ngưng hoạt động'; end if;

  if v_type='INCIDENT' then
    v_owner_department_id := coalesce(
      nullif(v_fields->>'incident_location_primary_department_id','')::uuid,
      v_primary_department_id
    );
  elsif v_type='INDICATOR_MEASUREMENT' then
    if nullif(v_fields->>'indicator_assignment_id','') is null then
      raise exception 'Cần chọn chỉ số được phân công';
    end if;
    select * into v_assignment
    from public.indicator_assignments
    where id=(v_fields->>'indicator_assignment_id')::uuid
      and work_year=p_work_year
      and status='ACTIVE';
    if not found then raise exception 'Phân công chỉ số không hợp lệ hoặc không còn hoạt động'; end if;
    v_owner_department_id := v_assignment.department_id;
    v_owner_user_id := coalesce(v_assignment.collector_user_id,p_actor_user_id);
  end if;

  if v_owner_department_id is not null and not exists(
    select 1 from public.departments d
    where d.id=v_owner_department_id and d.organization_id=v_org and d.is_active=true
  ) then raise exception 'Khoa/phòng phụ trách không hợp lệ'; end if;

  if v_owner_user_id is not null and not exists(
    select 1 from public.profiles p
    where p.user_id=v_owner_user_id and p.organization_id=v_org and p.is_active=true
  ) then raise exception 'Người phụ trách không hợp lệ'; end if;

  if v_type='INSPECTION' and
     (nullif(trim(coalesce(v_fields->>'inspection_type','')),'') is null or nullif(v_fields->>'visit_date','') is null)
  then raise exception 'Loại kiểm tra và ngày đoàn đến là bắt buộc'; end if;

  if v_type='INDICATOR_MEASUREMENT' then
    if nullif(v_fields->>'period_start','') is null or nullif(v_fields->>'period_end','') is null then
      raise exception 'Cần chọn chỉ số và kỳ đo';
    end if;
    if (v_fields->>'period_end')::date < (v_fields->>'period_start')::date then
      raise exception 'Ngày kết thúc kỳ đo không được trước ngày bắt đầu';
    end if;
  end if;

  if v_type='FINDING' and nullif(trim(coalesce(v_fields->>'description','')),'') is null
    then raise exception 'Mô tả Finding là bắt buộc'; end if;

  if v_type='INCIDENT' then
    if nullif(trim(coalesce(v_fields->>'initial_description','')),'') is null then raise exception 'Mô tả sự cố là bắt buộc'; end if;
    if nullif(v_fields->>'incident_location_primary_department_id','') is null then raise exception 'Khoa/phòng nơi xảy ra là bắt buộc'; end if;
    if nullif(v_fields->>'occurred_at','') is null then raise exception 'Ngày, giờ xảy ra sự cố là bắt buộc'; end if;
    if nullif(v_fields->>'reported_at','') is null then raise exception 'Ngày, giờ báo cáo là bắt buộc'; end if;
  end if;

  if v_type='CAPA' and nullif(trim(coalesce(v_fields->>'problem_statement','')),'') is null
    then raise exception 'Vấn đề cần CAPA là bắt buộc'; end if;
  if v_type='RISK' and nullif(trim(coalesce(v_fields->>'risk_event','')),'') is null
    then raise exception 'Sự kiện rủi ro là bắt buộc'; end if;

  if v_type='FMEA' then
    v_method := upper(trim(coalesce(v_fields->>'method','')));
    if v_method not in ('FMEA','HFMEA') then raise exception 'Cần chọn FMEA hoặc HFMEA'; end if;
  end if;

  if v_type='IMPROVEMENT_PROPOSAL' and nullif(trim(coalesce(v_fields->>'problem_description','')),'') is null
    then raise exception 'Vấn đề/thực trạng là bắt buộc'; end if;

  if v_type='ASSESSMENT' then
    if nullif(v_fields->>'criteria_version_id','') is null or nullif(trim(coalesce(v_fields->>'round_type','')),'') is null
      then raise exception 'Bộ tiêu chí và loại đợt là bắt buộc'; end if;
    select * into v_version from public.criteria_set_versions
    where id=(v_fields->>'criteria_version_id')::uuid and status='PUBLISHED';
    if not found then raise exception 'Chỉ được tạo đợt từ bộ tiêu chí đã PUBLISHED'; end if;
  end if;

  if v_type='EXTERNAL_ASSESSMENT' and nullif(trim(coalesce(v_fields->>'authority','')),'') is null
    then raise exception 'Cơ quan/đoàn đánh giá là bắt buộc'; end if;
  if v_type='AUDIT' and nullif(trim(coalesce(v_fields->>'audit_type','')),'') is null
    then raise exception 'Loại Audit / Tracer là bắt buộc'; end if;
  if v_type='FEEDBACK' and nullif(trim(coalesce(v_fields->>'description','')),'') is null
    then raise exception 'Nội dung phản ánh là bắt buộc'; end if;

  v_code := public.next_record_code(v_org,v_type,p_work_year);

  insert into public.records(
    organization_id,record_type,record_code,title,work_year,
    owner_department_id,owner_user_id,lifecycle_status,created_by
  ) values (
    v_org,v_type,v_code,v_title,p_work_year,
    v_owner_department_id,v_owner_user_id,'ACTIVE',p_actor_user_id
  )
  returning id into v_record_id;

  if v_type='DIRECTIVE' then
    insert into public.external_directives(
      record_id,source_authority,document_number,directive_type,issued_date,effective_date,received_date,
      document_url,implementation_due_date,report_due_date,summary,requirements,
      lead_department_id,owner_user_id,priority,workflow_status
    ) values (
      v_record_id,nullif(trim(v_fields->>'source_authority'),''),
      nullif(trim(v_fields->>'document_number'),''),nullif(trim(v_fields->>'directive_type'),''),
      nullif(v_fields->>'issued_date','')::date,nullif(v_fields->>'effective_date','')::date,
      nullif(v_fields->>'received_date','')::date,nullif(trim(v_fields->>'document_url'),''),
      nullif(v_fields->>'implementation_due_date','')::date,nullif(v_fields->>'report_due_date','')::date,
      nullif(trim(v_fields->>'summary'),''),nullif(trim(v_fields->>'requirements'),''),
      v_owner_department_id,v_owner_user_id,coalesce(nullif(trim(v_fields->>'priority'),''),'NORMAL'),'OPEN'
    ) returning id into v_domain_id;

  elsif v_type='REPORT' then
    insert into public.reporting_obligations(
      record_id,report_type,reporting_period,reporting_period_start,reporting_period_end,data_cutoff_date,
      due_date,preparing_department_id,preparer_user_id,recipient_name,submission_method,workflow_status,notes
    ) values (
      v_record_id,nullif(trim(v_fields->>'report_type'),''),nullif(trim(v_fields->>'reporting_period'),''),
      nullif(v_fields->>'reporting_period_start','')::date,nullif(v_fields->>'reporting_period_end','')::date,
      nullif(v_fields->>'data_cutoff_date','')::date,nullif(v_fields->>'due_date','')::date,
      v_owner_department_id,v_owner_user_id,nullif(trim(v_fields->>'recipient_name'),''),
      nullif(trim(v_fields->>'submission_method'),''),'NOT_DUE',nullif(trim(v_fields->>'notes'),'')
    ) returning id into v_domain_id;

  elsif v_type='INSPECTION' then
    insert into public.inspection_events(
      record_id,inspection_type,authority,visit_date,lead_department_id,owner_user_id,workflow_status
    ) values (
      v_record_id,trim(v_fields->>'inspection_type'),nullif(trim(v_fields->>'authority'),''),
      (v_fields->>'visit_date')::date,v_owner_department_id,v_owner_user_id,'PLANNING'
    ) returning id into v_domain_id;

  elsif v_type='INDICATOR_MEASUREMENT' then
    insert into public.indicator_measurements(
      record_id,indicator_assignment_id,period_start,period_end,numerator_value,denominator_value,
      raw_value,source_mode,workflow_status,entered_by
    ) values (
      v_record_id,v_assignment.id,(v_fields->>'period_start')::date,(v_fields->>'period_end')::date,
      nullif(v_fields->>'numerator_value','')::numeric,nullif(v_fields->>'denominator_value','')::numeric,
      nullif(v_fields->>'raw_value','')::numeric,'MANUAL','DRAFT',p_actor_user_id
    ) returning id into v_domain_id;

  elsif v_type='FINDING' then
    insert into public.findings(
      record_id,finding_type,description,severity,lead_department_id,owner_user_id,
      identified_at,due_date,immediate_action,workflow_status
    ) values (
      v_record_id,nullif(trim(v_fields->>'finding_type'),''),trim(v_fields->>'description'),
      nullif(trim(v_fields->>'severity'),''),v_owner_department_id,v_owner_user_id,
      coalesce(nullif(v_fields->>'identified_at','')::timestamptz,v_now),
      nullif(v_fields->>'due_date','')::date,nullif(trim(v_fields->>'immediate_action'),''),'OPEN'
    ) returning id into v_domain_id;

  elsif v_type='INCIDENT' then
    insert into public.incidents(
      record_id,occurred_at,detected_at,reported_at,incident_location_department_id,
      incident_location_type,incident_location_text,summary,workflow_status,lead_department_id,case_owner_user_id
    ) values (
      v_record_id,(v_fields->>'occurred_at')::timestamptz,nullif(v_fields->>'detected_at','')::timestamptz,
      (v_fields->>'reported_at')::timestamptz,(v_fields->>'incident_location_primary_department_id')::uuid,
      nullif(trim(v_fields->>'incident_location_type'),''),nullif(trim(v_fields->>'incident_location_text'),''),
      trim(v_fields->>'initial_description'),'REPORTED',v_owner_department_id,null
    ) returning id into v_domain_id;

    v_on_behalf_department_id := nullif(v_fields->>'on_behalf_primary_department_id','')::uuid;
    v_reporter_department_id := coalesce(
      nullif(v_fields->>'reporter_primary_department_id','')::uuid,
      v_on_behalf_department_id,
      v_primary_department_id
    );
    if v_reporter_department_id is not null then
      select name into v_reporter_department_name
      from public.departments
      where id=v_reporter_department_id and organization_id=v_org;
    end if;
    v_reporter_name := coalesce(
      nullif(trim(v_fields->>'reporter_name'),''),
      case when v_on_behalf_department_id is null then v_actor_name else null end
    );

    insert into public.incident_reports(
      incident_id,report_type,reporter_user_id,reporter_name_snapshot,reporter_department_id,
      reporter_department_name_snapshot,reporter_identity_confidential,reporter_phone,reporter_email,
      reporter_role_type,incident_location_department_id,incident_location_type,occurred_at,detected_at,
      initial_description,initial_solution_proposal,initial_harm_assessment,initial_response_description,
      notified_treating_responsible,documented_in_medical_record,notified_family_guardian,notified_patient,
      initial_occurrence_classification,patient_name,patient_code,patient_date_of_birth,patient_sex,
      patient_department_id,incident_subject_type,mandatory_report_flag
    ) values (
      v_domain_id,coalesce(nullif(trim(v_fields->>'report_type'),''),'VOLUNTARY'),p_actor_user_id,
      v_reporter_name,v_reporter_department_id,v_reporter_department_name,
      coalesce((v_fields->>'reporter_identity_confidential')::boolean,false),
      nullif(trim(v_fields->>'reporter_phone'),''),nullif(trim(v_fields->>'reporter_email'),''),
      nullif(trim(v_fields->>'reporter_role_type'),''),(v_fields->>'incident_location_primary_department_id')::uuid,
      nullif(trim(v_fields->>'incident_location_type'),''),(v_fields->>'occurred_at')::timestamptz,
      nullif(v_fields->>'detected_at','')::timestamptz,trim(v_fields->>'initial_description'),
      nullif(trim(v_fields->>'initial_solution_proposal'),''),nullif(trim(v_fields->>'initial_harm_assessment'),''),
      nullif(trim(v_fields->>'initial_response_description'),''),
      coalesce((v_fields->>'notified_treating_responsible')::boolean,false),
      coalesce((v_fields->>'documented_in_medical_record')::boolean,false),
      coalesce((v_fields->>'notified_family_guardian')::boolean,false),
      coalesce((v_fields->>'notified_patient')::boolean,false),
      nullif(trim(v_fields->>'initial_occurrence_classification'),''),nullif(trim(v_fields->>'patient_name'),''),
      nullif(trim(v_fields->>'patient_code'),''),nullif(v_fields->>'patient_date_of_birth','')::date,
      nullif(trim(v_fields->>'patient_sex'),''),nullif(v_fields->>'patient_primary_department_id','')::uuid,
      nullif(trim(v_fields->>'incident_subject_type'),''),
      coalesce(nullif(trim(v_fields->>'report_type'),'')='MANDATORY',false)
    );

  elsif v_type='CAPA' then
    insert into public.capas(
      record_id,problem_statement,priority,immediate_correction,lead_department_id,owner_user_id,
      workflow_status,approval_required,effectiveness_due_date
    ) values (
      v_record_id,trim(v_fields->>'problem_statement'),
      coalesce(nullif(trim(v_fields->>'priority'),''),'NORMAL'),
      nullif(trim(v_fields->>'immediate_correction'),''),v_owner_department_id,v_owner_user_id,
      'DRAFT',coalesce((v_fields->>'approval_required')::boolean,false),
      nullif(v_fields->>'effectiveness_due_date','')::date
    ) returning id into v_domain_id;

  elsif v_type='RISK' then
    insert into public.risks(
      record_id,identified_year,risk_event,cause_summary,potential_consequence,process_name,
      location_department_id,owner_department_id,owner_user_id,workflow_status,next_review_date,review_frequency
    ) values (
      v_record_id,p_work_year,trim(v_fields->>'risk_event'),nullif(trim(v_fields->>'cause_summary'),''),
      nullif(trim(v_fields->>'potential_consequence'),''),nullif(trim(v_fields->>'process_name'),''),
      v_owner_department_id,v_owner_department_id,v_owner_user_id,'IDENTIFIED',
      nullif(v_fields->>'next_review_date','')::date,nullif(trim(v_fields->>'review_frequency'),'')
    ) returning id into v_domain_id;

  elsif v_type='FMEA' then
    insert into public.fmea_studies(
      record_id,method,title,process_name,scope,work_year,lead_department_id,lead_user_id,
      start_date,target_completion_date,scoring_model_version_id,workflow_status
    ) values (
      v_record_id,v_method,v_title,nullif(trim(v_fields->>'process_name'),''),
      nullif(trim(v_fields->>'scope'),''),p_work_year,v_owner_department_id,v_owner_user_id,
      nullif(v_fields->>'start_date','')::date,nullif(v_fields->>'target_completion_date','')::date,
      nullif(v_fields->>'scoring_model_version_id','')::uuid,'DRAFT'
    ) returning id into v_domain_id;

  elsif v_type='IMPROVEMENT_PROPOSAL' then
    insert into public.improvement_proposals(
      record_id,work_year,title,problem_description,reason_for_improvement,source_type,
      proposing_department_id,proposer_user_id,existing_data_summary,proposed_scope,workflow_status
    ) values (
      v_record_id,p_work_year,v_title,trim(v_fields->>'problem_description'),
      nullif(trim(v_fields->>'reason_for_improvement'),''),nullif(trim(v_fields->>'source_type'),''),
      v_owner_department_id,coalesce(v_owner_user_id,p_actor_user_id),
      nullif(trim(v_fields->>'existing_data_summary'),''),nullif(trim(v_fields->>'proposed_scope'),''),'DRAFT'
    ) returning id into v_domain_id;

  elsif v_type='IMPROVEMENT_PROJECT' then
    insert into public.improvement_projects(
      record_id,work_year,title,problem_statement,lead_department_id,project_leader_user_id,
      start_date,target_end_date,scope_description,workflow_status
    ) values (
      v_record_id,p_work_year,v_title,nullif(trim(v_fields->>'problem_statement'),''),
      v_owner_department_id,v_owner_user_id,nullif(v_fields->>'start_date','')::date,
      nullif(v_fields->>'target_end_date','')::date,nullif(trim(v_fields->>'scope_description'),''),'DRAFT'
    ) returning id into v_domain_id;

  elsif v_type='ASSESSMENT' then
    insert into public.assessment_rounds(
      record_id,criteria_version_id,work_year,round_type,start_date,submission_deadline,
      review_deadline,finalization_date,workflow_status
    ) values (
      v_record_id,v_version.id,p_work_year,trim(v_fields->>'round_type'),
      nullif(v_fields->>'start_date','')::date,nullif(v_fields->>'submission_deadline','')::date,
      nullif(v_fields->>'review_deadline','')::date,nullif(v_fields->>'finalization_date','')::date,'DRAFT'
    ) returning id into v_domain_id;

    -- Seed phạm vi đợt từ Bộ tiêu chí — khoa/phòng phụ trách chính VÀ hỗ trợ
    -- đã khai báo sẵn ở từng tiêu chí, để đợt mới mở ra đã có phân công thay
    -- vì luôn "Chưa gán khoa/phòng".
    insert into public.assessment_round_criteria(
      assessment_round_id,criteria_item_id,criterion_id,is_required,lead_department_id,support_department_ids
    )
    select v_domain_id,ci.id,ci.id,true,ci.owner_department_id,coalesce(ci.support_department_ids,'{}'::uuid[])
    from public.criteria_items ci
    where ci.criteria_version_id=v_version.id;

  elsif v_type='EXTERNAL_ASSESSMENT' then
    insert into public.external_assessment_events(
      record_id,authority,assessment_date,criteria_version_id,notes
    ) values (
      v_record_id,trim(v_fields->>'authority'),nullif(v_fields->>'assessment_date','')::date,
      nullif(v_fields->>'criteria_version_id','')::uuid,nullif(trim(v_fields->>'notes'),'')
    ) returning id into v_domain_id;

  elsif v_type='AUDIT' then
    insert into public.audits(
      record_id,audit_type,work_year,title,objective,start_date,end_date,lead_auditor_id,workflow_status
    ) values (
      v_record_id,trim(v_fields->>'audit_type'),p_work_year,v_title,nullif(trim(v_fields->>'objective'),''),
      nullif(v_fields->>'start_date','')::date,nullif(v_fields->>'end_date','')::date,v_owner_user_id,'DRAFT'
    ) returning id into v_domain_id;

  elsif v_type='SAFETY_ALERT' then
    insert into public.safety_alerts(
      record_id,title,summary,lesson,recommendation,expires_at,status
    ) values (
      v_record_id,v_title,nullif(trim(v_fields->>'summary'),''),nullif(trim(v_fields->>'lesson'),''),
      nullif(trim(v_fields->>'recommendation'),''),nullif(v_fields->>'expires_at','')::timestamptz,'DRAFT'
    ) returning id into v_domain_id;

  elsif v_type='FEEDBACK' then
    insert into public.feedback_records(
      record_id,feedback_type,received_at,source_channel,subject,description,related_department_id,
      owner_user_id,response_due_at,workflow_status
    ) values (
      v_record_id,nullif(trim(v_fields->>'feedback_type'),''),coalesce(nullif(v_fields->>'received_at','')::timestamptz,v_now),
      nullif(trim(v_fields->>'source_channel'),''),nullif(trim(v_fields->>'subject'),''),
      trim(v_fields->>'description'),v_owner_department_id,v_owner_user_id,
      nullif(v_fields->>'response_due_at','')::timestamptz,'RECEIVED'
    ) returning id into v_domain_id;
  end if;

  if v_domain_id is null then raise exception 'Không tạo được dữ liệu nghiệp vụ'; end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,new_value,reason,request_meta
  ) values (
    p_actor_user_id,v_record_id,'records',v_record_id,'DOMAIN_RECORD_CREATE',
    jsonb_build_object(
      'record_type',v_type,'record_code',v_code,'domain_id',v_domain_id,
      'owner_department_id',v_owner_department_id,'owner_user_id',v_owner_user_id
    ),
    'Tạo hồ sơ Registry và dữ liệu nghiệp vụ trong một giao dịch.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_create_domain_record_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'record_id',v_record_id,
    'record_code',v_code,
    'domain_id',v_domain_id,
    'record_type',v_type
  );
end;
$function$;

revoke all on function public.qlcl_create_domain_record_v1(uuid,text,text,integer,uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.qlcl_create_domain_record_v1(uuid,text,text,integer,uuid,uuid,jsonb)
  to service_role;

-- Đồng bộ thủ công (nút "Đồng bộ khoa/phòng phụ trách từ Bộ tiêu chí") cũng
-- kéo theo support_department_ids, không chỉ lead_department_id. Nới điều
-- kiện khớp dòng: đồng bộ cả khi tiêu chí chỉ có khoa/phòng hỗ trợ mà chưa có
-- phụ trách chính (owner_department_id null nhưng support_department_ids có
-- phần tử), để không bỏ sót phân công hỗ trợ.
create or replace function public.qlcl_sync_assessment_round_lead_departments_v1(
  p_actor_user_id uuid,
  p_assessment_round_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_round public.assessment_rounds%rowtype;
  v_updated integer;
begin
  if p_actor_user_id is null then raise exception 'Thiếu người thực hiện'; end if;

  select organization_id into v_org
  from public.profiles
  where user_id = p_actor_user_id and is_active = true;
  if v_org is null then raise exception 'Tài khoản chưa gắn tổ chức hoặc đã ngưng hoạt động'; end if;

  select ar.* into v_round
  from public.assessment_rounds ar
  join public.records r on r.id = ar.record_id
  where ar.id = p_assessment_round_id and r.organization_id = v_org;
  if not found then raise exception 'Không tìm thấy đợt tự đánh giá hoặc ngoài phạm vi truy cập'; end if;

  if v_round.workflow_status <> 'DRAFT' then
    raise exception 'Chỉ đồng bộ khoa/phòng phụ trách khi đợt đang ở trạng thái Chuẩn bị';
  end if;

  update public.assessment_round_criteria arc
  set lead_department_id = ci.owner_department_id,
      support_department_ids = coalesce(ci.support_department_ids,'{}'::uuid[])
  from public.criteria_items ci
  where arc.assessment_round_id = p_assessment_round_id
    and arc.criteria_item_id = ci.id
    and (ci.owner_department_id is not null or coalesce(array_length(ci.support_department_ids,1),0) > 0)
    and (
      arc.lead_department_id is distinct from ci.owner_department_id
      or coalesce(arc.support_department_ids,'{}'::uuid[]) is distinct from coalesce(ci.support_department_ids,'{}'::uuid[])
    );
  get diagnostics v_updated = row_count;

  insert into public.audit_logs(
    actor_user_id, record_id, table_name, row_id, action_type, new_value, reason, request_meta
  ) values (
    p_actor_user_id, v_round.record_id, 'assessment_round_criteria', p_assessment_round_id,
    'ASSESSMENT_ROUND_SYNC_LEAD_DEPARTMENTS',
    jsonb_build_object('assessment_round_id', p_assessment_round_id, 'updated_count', v_updated),
    'Đồng bộ khoa/phòng phụ trách tiêu chí từ Bộ tiêu chí vào đợt tự đánh giá.',
    jsonb_build_object('source', 'qlcl-ui', 'transaction', 'qlcl_sync_assessment_round_lead_departments_v1')
  );

  return jsonb_build_object('ok', true, 'updated_count', v_updated);
end;
$function$;

revoke all on function public.qlcl_sync_assessment_round_lead_departments_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.qlcl_sync_assessment_round_lead_departments_v1(uuid, uuid)
  to service_role;
