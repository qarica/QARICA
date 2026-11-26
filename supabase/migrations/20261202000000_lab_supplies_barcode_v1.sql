-- Kho hóa chất & VTYT khoa Xét nghiệm: thêm MÃ VẠCH / MÃ QR của vật tư để quét tra cứu tồn kho.
-- Chỉ thêm cột (nullable) + chỉ mục duy nhất theo tổ chức — an toàn chạy lại, không đụng dữ liệu cũ, không đổi
-- sổ xuất nhập (bất biến). Mã vạch là mã in trên hộp (mã hãng/GS1/mã nội bộ); khác với "code" là mã quản lý nội bộ.
alter table public.lab_supply_items add column if not exists barcode text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lab_supply_items_barcode_len_check') then
    alter table public.lab_supply_items
      add constraint lab_supply_items_barcode_len_check
      check (barcode is null or char_length(btrim(barcode)) between 1 and 64);
  end if;
end $$;

-- Một mã vạch chỉ gắn cho 1 vật tư trong cùng tổ chức (không phân biệt hoa/thường, bỏ khoảng trắng 2 đầu).
create unique index if not exists lab_supply_items_org_barcode_uidx
  on public.lab_supply_items (organization_id, lower(btrim(barcode)))
  where barcode is not null;
