-- QARICA checklist version clone atomic transaction V1.
create or replace function public.qlcl_clone_checklist_version_v1(
  p_template_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_template public.checklist_templates%rowtype;
  v_existing public.checklist_versions%rowtype;
  v_source public.checklist_versions%rowtype;
  v_new_version_id uuid;
  v_version_no integer;
  v_section record;
  v_item record;
  v_new_section_id uuid;
  v_new_item_id uuid;
  v_section_count integer := 0;
  v_item_count integer := 0;
  v_option_count integer := 0;
begin
  if p_template_id is null or p_actor_user_id is null then
    raise exception 'Thiếu mẫu bảng kiểm hoặc người thao tác';
  end if;

  select t.* into v_template
  from public.checklist_templates t
  join public.profiles p on p.organization_id=t.organization_id
  where t.id=p_template_id
    and p.user_id=p_actor_user_id
    and p.is_active=true
  for update of t;

  if not found then
    raise exception 'Không tìm thấy mẫu bảng kiểm hoặc ngoài phạm vi tổ chức';
  end if;
  if not v_template.is_active then
    raise exception 'Mẫu bảng kiểm đã ngưng sử dụng';
  end if;

  select * into v_existing
  from public.checklist_versions
  where checklist_template_id=p_template_id and status='DRAFT'
  order by version_no desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok',true,'existing',true,'version_id',v_existing.id,'version_no',v_existing.version_no,
      'section_count',0,'item_count',0,'option_count',0
    );
  end if;

  select * into v_source
  from public.checklist_versions
  where checklist_template_id=p_template_id
  order by version_no desc
  limit 1
  for update;

  if not found then
    raise exception 'Mẫu bảng kiểm chưa có phiên bản nguồn';
  end if;

  select coalesce(max(version_no),0)+1 into v_version_no
  from public.checklist_versions
  where checklist_template_id=p_template_id;

  insert into public.checklist_versions(
    checklist_template_id,version_no,status,scoring_method,created_at
  ) values (
    p_template_id,v_version_no,'DRAFT',v_source.scoring_method,now()
  )
  returning id into v_new_version_id;

  for v_section in
    select id,title,description,sequence_no
    from public.checklist_sections
    where checklist_version_id=v_source.id
    order by sequence_no,id
  loop
    insert into public.checklist_sections(
      checklist_version_id,title,description,sequence_no
    ) values (
      v_new_version_id,v_section.title,v_section.description,v_section.sequence_no
    )
    returning id into v_new_section_id;
    v_section_count := v_section_count + 1;

    for v_item in
      select *
      from public.checklist_items
      where checklist_version_id=v_source.id and section_id=v_section.id
      order by sequence_no,id
    loop
      insert into public.checklist_items(
        checklist_version_id,section_id,code,content,answer_type,sequence_no,
        is_required,is_critical,allow_na,na_reason_required,scoring_enabled,
        score_value,weight,evidence_required_on_fail,finding_on_fail,metadata
      ) values (
        v_new_version_id,v_new_section_id,v_item.code,v_item.content,v_item.answer_type,v_item.sequence_no,
        v_item.is_required,v_item.is_critical,v_item.allow_na,v_item.na_reason_required,v_item.scoring_enabled,
        v_item.score_value,v_item.weight,v_item.evidence_required_on_fail,v_item.finding_on_fail,v_item.metadata
      )
      returning id into v_new_item_id;
      v_item_count := v_item_count + 1;

      insert into public.checklist_item_options(
        checklist_item_id,option_code,option_label,option_value,sort_order
      )
      select
        v_new_item_id,o.option_code,o.option_label,o.option_value,o.sort_order
      from public.checklist_item_options o
      where o.checklist_item_id=v_item.id
      order by o.sort_order,o.id;

      get diagnostics v_option_count = row_count + v_option_count;
    end loop;
  end loop;

  insert into public.audit_logs(
    actor_user_id,table_name,row_id,action_type,new_value,reason,request_meta
  ) values (
    p_actor_user_id,'checklist_versions',v_new_version_id,'CHECKLIST_VERSION_CREATE',
    jsonb_build_object(
      'template_id',p_template_id,
      'source_version_id',v_source.id,
      'version_no',v_version_no,
      'section_count',v_section_count,
      'item_count',v_item_count,
      'option_count',v_option_count
    ),
    'Tạo phiên bản Nháp mới từ phiên bản gần nhất.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_clone_checklist_version_v1')
  );

  return jsonb_build_object(
    'ok',true,'existing',false,'version_id',v_new_version_id,'version_no',v_version_no,
    'section_count',v_section_count,'item_count',v_item_count,'option_count',v_option_count
  );
end;
$function$;

revoke all on function public.qlcl_clone_checklist_version_v1(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.qlcl_clone_checklist_version_v1(uuid,uuid)
to service_role;
