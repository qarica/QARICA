-- Phần 2/3 của sửa lỗi "đợt tự đánh giá không có chỗ phân công khoa/phòng":
-- đợt ASSESSMENT-2026-0001 đã tạo TRƯỚC migration seed-fix (20261113) nên
-- assessment_round_criteria.lead_department_id của đợt đó vẫn null dù
-- Bộ tiêu chí đã/sẽ được gán owner_department_id. RPC này cho người quản lý
-- đợt (ở trạng thái DRAFT) kéo lại phân công từ Bộ tiêu chí bất kỳ lúc nào,
-- không giới hạn một lần tạo đợt, không cần migration dữ liệu thủ công.
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
  set lead_department_id = ci.owner_department_id
  from public.criteria_items ci
  where arc.assessment_round_id = p_assessment_round_id
    and arc.criteria_item_id = ci.id
    and ci.owner_department_id is not null
    and arc.lead_department_id is distinct from ci.owner_department_id;
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
