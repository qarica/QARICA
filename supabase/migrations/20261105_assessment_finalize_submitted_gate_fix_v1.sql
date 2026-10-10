-- FINALIZE đợt tự đánh giá luôn luôn thất bại: cổng điều kiện của FINALIZE chỉ
-- chấp nhận criterion_assessments.workflow_status IN ('REVIEWED','FINALIZED',
-- 'COMPLETED','APPROVED') — nhưng không nơi nào trong hệ thống (RPC
-- qlcl_save_criterion_assessment_v1 chỉ ghi 'DRAFT'/'SUBMITTED') từng đặt một
-- dòng vào 1 trong 4 trạng thái đó trước khi FINALIZE chạy. Trong khi đó,
-- SUBMIT_REVIEW (chuyển IN_PROGRESS -> REVIEWING, cùng migration
-- 20260923153500_assessment_transition_atomic_v1.sql) lại coi 'SUBMITTED' là
-- đã đủ điều kiện ("đã gửi"). Kết quả: sau khi chuyển sang REVIEWING, nút
-- "Chốt kết quả đợt đánh giá" không bao giờ bấm được — luôn báo "Mới có 0/N
-- tiêu chí áp dụng được rà soát; chưa đủ để chốt đợt." dù đã gửi đủ 100%.
--
-- Sửa: thêm 'SUBMITTED' vào bộ trạng thái FINALIZE chấp nhận, khớp đúng
-- ngưỡng sẵn sàng mà SUBMIT_REVIEW đã dùng cho CÙNG một lô tiêu chí — không
-- nới lỏng thêm gì ngoài việc làm 2 cổng của cùng một luồng nhất quán với
-- nhau (không có RPC "đánh dấu đã rà soát" riêng nào tồn tại để tạo ra trạng
-- thái REVIEWED, nên yêu cầu REVIEWED tại FINALIZE là điều kiện không thể
-- thỏa, không phải một kiểm soát an toàn có chủ đích).
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
    and ca.workflow_status in ('SUBMITTED','REVIEWED','FINALIZED','COMPLETED','APPROVED')
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
