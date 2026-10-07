-- Phát hiện từ báo cáo thẩm định: qlcl_review_capa_effectiveness_v1 cho phép
-- kết luận hiệu lực CAPA ngay khi vừa chuyển sang EFFECTIVENESS_REVIEW, không
-- ép khoảng thời gian theo dõi tối thiểu — "CAPA hiệu quả" có thể được kết
-- luận trong cùng ngày, không có giá trị bằng chứng thực tế.
--
-- Thêm điều kiện: nếu CAPA đã khai báo effectiveness_due_date (tại lúc tạo,
-- field tùy chọn), chỉ cho đánh giá khi now() đã tới/qua ngày đó. CAPA chưa
-- khai báo effectiveness_due_date (null) vẫn được đánh giá như cũ — không
-- tạo đường cụt cho các CAPA cũ/không đặt hạn, chỉ xiết chặt đúng trường hợp
-- đã có hạn rõ ràng mà báo cáo chỉ ra là bị bỏ qua.
create or replace function public.qlcl_review_capa_effectiveness_v1(
  p_capa_record_id uuid,
  p_actor_user_id uuid,
  p_result text,
  p_evaluation_method text,
  p_target_description text,
  p_actual_result text,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_capa public.capas%rowtype;
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'Asia/Ho_Chi_Minh')::date;
  v_result text := upper(trim(coalesce(p_result,'')));
  v_method text := trim(coalesce(p_evaluation_method,''));
  v_target text := trim(coalesce(p_target_description,''));
  v_actual text := trim(coalesce(p_actual_result,''));
  v_comment text := nullif(trim(coalesce(p_comment,'')),'');
  v_review_no integer := 1;
  v_review_id uuid;
  v_new_status text;
begin
  if p_capa_record_id is null or p_actor_user_id is null then
    raise exception 'Thiếu CAPA hoặc người đánh giá';
  end if;
  if v_result not in ('EFFECTIVE','PARTIALLY_EFFECTIVE','INEFFECTIVE') then
    raise exception 'Kết luận hiệu lực không hợp lệ';
  end if;
  if v_method='' or v_target='' or v_actual='' then
    raise exception 'Cần đủ phương pháp, mục tiêu và kết quả thực tế';
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
  if v_capa.workflow_status <> 'EFFECTIVENESS_REVIEW' then
    raise exception 'CAPA chưa đến bước đánh giá hiệu lực';
  end if;
  if v_capa.effectiveness_due_date is not null and v_now < v_capa.effectiveness_due_date::timestamptz then
    raise exception 'Chưa đến hạn đánh giá hiệu lực (%), không thể kết luận trước thời điểm này', to_char(v_capa.effectiveness_due_date,'DD/MM/YYYY');
  end if;

  select coalesce(max(review_no),0)+1 into v_review_no
  from public.capa_effectiveness_reviews
  where capa_id=v_capa.id;

  insert into public.capa_effectiveness_reviews(
    capa_id,review_no,planned_review_date,actual_review_date,
    evaluation_method,target_description,actual_result,result,comment,reviewed_by
  ) values (
    v_capa.id,v_review_no,v_capa.effectiveness_due_date,v_today,
    v_method,v_target,v_actual,v_result,v_comment,p_actor_user_id
  )
  returning id into v_review_id;

  v_new_status := case when v_result='EFFECTIVE' then 'EFFECTIVE' else 'IN_PROGRESS' end;

  update public.capas
  set workflow_status=v_new_status,
      updated_at=v_now
  where id=v_capa.id
    and workflow_status='EFFECTIVENESS_REVIEW';

  if not found then
    raise exception 'Trạng thái CAPA đã thay đổi. Vui lòng tải lại';
  end if;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,
    old_value,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_capa_record_id,'capas',v_capa.id,
    'CAPA_REVIEW_EFFECTIVENESS',
    jsonb_build_object('workflow_status','EFFECTIVENESS_REVIEW'),
    jsonb_build_object(
      'workflow_status',v_new_status,
      'effectiveness_result',v_result,
      'review_id',v_review_id,
      'review_no',v_review_no
    ),
    v_comment,
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_review_capa_effectiveness_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'workflow_status',v_new_status,
    'result',v_result,
    'review_id',v_review_id,
    'review_no',v_review_no,
    'reviewed_at',v_now
  );
end;
$function$;

revoke all on function public.qlcl_review_capa_effectiveness_v1(uuid,uuid,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.qlcl_review_capa_effectiveness_v1(uuid,uuid,text,text,text,text,text)
  to service_role;
