-- Kho hóa chất/VTYT XN: phiếu HỦY và ĐIỀU CHỈNH bắt buộc có lý do ngay ở tầng DB.
--
-- Ràng buộc lab_supply_movements_reason_check cũ dùng biểu thức OR; khi reason_code
-- NULL thì nhánh DISPOSAL/ADJUST cho kết quả NULL, và CHECK coi NULL là hợp lệ, nên
-- gọi thẳng RPC (bỏ qua route API) vẫn ghi được phiếu hủy/điều chỉnh không lý do.
-- Sổ kho bất biến (không sửa/xóa được) nên phải chặn từ gốc. Ràng buộc cũ giữ nguyên
-- (không sửa migration đã chạy); thêm ràng buộc bổ sung không cho phép NULL.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lab_supply_movements'::regclass
      and conname = 'lab_supply_movements_reason_required_check'
  ) then
    alter table public.lab_supply_movements
      add constraint lab_supply_movements_reason_required_check
      check (movement_type in ('RECEIPT', 'ISSUE') or reason_code is not null);
  end if;
end $$;
