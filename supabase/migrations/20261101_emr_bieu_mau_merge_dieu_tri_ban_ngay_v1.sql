-- Yêu cầu thực tế: "gộm Ngoại trú và điều trị ban ngày thành Ngoại trú" — ma
-- trận "Phạm vi áp dụng" của Biểu mẫu (theo loại hồ sơ bệnh án) không tách
-- gáy riêng cho "Điều trị ban ngày" nữa, gộp chung vào "Ngoại trú" (xem
-- src/lib/emr-categories.ts, field record_types đã bỏ lựa chọn này khỏi
-- options). record_types lưu dạng chuỗi phân tách dấu phẩy trong
-- emr_rollout_items.details (jsonb), không phải mảng — cần sửa dữ liệu CŨ
-- cho mọi biểu mẫu đã tick "Điều trị ban ngày": đổi thành "Ngoại trú" và gộp
-- trùng (phòng trường hợp biểu mẫu đã tick sẵn cả hai).
update public.emr_rollout_items t
set details = jsonb_set(
  t.details,
  '{record_types}',
  to_jsonb(merged.joined)
)
from (
  select t2.id,
    (
      select string_agg(distinct trim(x), ', ')
      from unnest(string_to_array(replace(t2.details->>'record_types', 'Điều trị ban ngày', 'Ngoại trú'), ',')) as x
      where trim(x) <> ''
    ) as joined
  from public.emr_rollout_items t2
  where t2.category = 'BIEU_MAU'
    and t2.details ? 'record_types'
    and t2.details->>'record_types' like '%Điều trị ban ngày%'
) merged
where t.id = merged.id;
