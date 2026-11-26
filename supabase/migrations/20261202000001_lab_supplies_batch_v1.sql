-- Kho hóa chất & VTYT khoa Xét nghiệm: PHIẾU NHIỀU DÒNG (nhập / xuất dùng / hủy hàng) trong MỘT giao dịch.
-- Mỗi dòng vẫn đi qua đúng hàm 1 dòng đã có (qlcl_lab_supply_receive_v1 / qlcl_lab_supply_post_movement_v1) nên
-- mọi ràng buộc nghiệp vụ giữ nguyên (hạn dùng bắt buộc, chặn tồn âm, chặn lô hết hạn, chặn kỳ đã chốt, khóa theo tổ chức).
-- Hàm bọc chỉ lặp dòng; MỘT dòng lỗi => ném lỗi kèm "Dòng N" => TOÀN BỘ phiếu bị hoàn tác (sổ bất biến nên không để
-- lại nửa phiếu). Chỉ thêm hàm, không đổi bảng/dữ liệu; chỉ service_role gọi được (như các hàm kho khác).

create or replace function public.qlcl_lab_supply_batch_receive_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_movement_date date,
  p_reference_no text,
  p_counterparty text,
  p_note text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line jsonb;
  v_idx integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_one jsonb;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Phiếu nhập chưa có dòng nào';
  end if;
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'Một phiếu tối đa 100 dòng';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;
    begin
      v_one := public.qlcl_lab_supply_receive_v1(
        p_organization_id,
        p_actor_user_id,
        (v_line ->> 'item_id')::uuid,
        v_line ->> 'lot_number',
        nullif(v_line ->> 'expiry_date', '')::date,
        (v_line ->> 'quantity')::numeric,
        p_movement_date,
        p_reference_no,
        p_counterparty,
        coalesce(nullif(v_line ->> 'note', ''), p_note)
      );
    exception when others then
      raise exception 'Dòng %: %', v_idx, sqlerrm;
    end;
    v_results := v_results || jsonb_build_array(v_one);
  end loop;

  return jsonb_build_object('ok', true, 'lines', v_idx, 'results', v_results);
end;
$$;

create or replace function public.qlcl_lab_supply_batch_issue_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_movement_type text,
  p_movement_date date,
  p_reference_no text,
  p_counterparty text,
  p_reason_code text,
  p_note text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line jsonb;
  v_idx integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_one jsonb;
  v_qty numeric;
begin
  if p_movement_type not in ('ISSUE', 'DISPOSAL') then
    raise exception 'Phiếu nhiều dòng chỉ dùng cho xuất dùng hoặc hủy hàng';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Phiếu chưa có dòng nào';
  end if;
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'Một phiếu tối đa 100 dòng';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;
    begin
      v_qty := (v_line ->> 'quantity')::numeric;
      if v_qty is null or v_qty <= 0 then raise exception 'Số lượng phải lớn hơn 0'; end if;
      v_one := public.qlcl_lab_supply_post_movement_v1(
        p_organization_id,
        p_actor_user_id,
        (v_line ->> 'lot_id')::uuid,
        p_movement_type,
        -v_qty,
        p_movement_date,
        p_reference_no,
        p_counterparty,
        case when p_movement_type = 'DISPOSAL' then p_reason_code else null end,
        coalesce(nullif(v_line ->> 'note', ''), p_note)
      );
    exception when others then
      raise exception 'Dòng %: %', v_idx, sqlerrm;
    end;
    v_results := v_results || jsonb_build_array(v_one);
  end loop;

  return jsonb_build_object('ok', true, 'lines', v_idx, 'results', v_results);
end;
$$;

revoke execute on function public.qlcl_lab_supply_batch_receive_v1(uuid,uuid,date,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.qlcl_lab_supply_batch_receive_v1(uuid,uuid,date,text,text,text,jsonb) to service_role;
revoke execute on function public.qlcl_lab_supply_batch_issue_v1(uuid,uuid,text,date,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.qlcl_lab_supply_batch_issue_v1(uuid,uuid,text,date,text,text,text,text,jsonb) to service_role;
