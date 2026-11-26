-- Kho hóa chất & vật tư y tế khoa Xét nghiệm (Nhập – Xuất – Tồn theo lô/hạn
-- dùng, kiểm kê, hao hụt, hủy hàng hết hạn, chốt kỳ).
--
-- Yêu cầu tường minh của người dùng: menu ĐỘC LẬP, không liên kết với các
-- menu khác (không gắn khoa/phòng của module TTBYT, không gắn bệnh nhân/lượt
-- xét nghiệm, không gắn mua sắm). Vì vậy KHÔNG có khóa ngoại tới departments,
-- medical_equipment, procurement... Chỉ gắn organization_id (đa tổ chức).
--
-- Nguyên tắc "một nghiệp vụ chỉ có một nguồn sự thật" (CLAUDE.md): số tồn
-- KHÔNG được lưu thành cột. Tồn của lô/vật tư luôn là tổng quantity_delta của
-- sổ xuất nhập (lab_supply_movements) — không thể lệch giữa "tồn đầu kỳ nhập
-- tay" và sổ. Sổ xuất nhập bất biến (trigger chặn sửa/xóa): sai sót được sửa
-- bằng dòng điều chỉnh ADJUST mới, không ghi đè dòng cũ. Tồn đầu kỳ của một
-- kỳ báo cáo = tổng các dòng có ngày trước kỳ (xem hàm báo cáo bên dưới).
--
-- Toàn bộ thao tác ghi đi qua hàm RPC chỉ cấp cho service_role: khóa dòng lô
-- (for update) + khóa theo tổ chức để kiểm tra tồn không âm, không xuất lô
-- hết hạn và không ghi lùi vào kỳ đã chốt một cách nguyên tử.

create table if not exists public.lab_supply_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null check (char_length(btrim(code)) between 1 and 40),
  name text not null check (char_length(btrim(name)) between 1 and 300),
  category text not null default 'REAGENT' check (category in ('REAGENT','CONSUMABLE','CONTROL_CALIBRATOR','OTHER')),
  unit text not null check (char_length(btrim(unit)) between 1 and 40),
  manufacturer text,
  storage_condition text,
  -- Ngưỡng cảnh báo sắp hết: cấu hình theo từng vật tư, không hard-code.
  min_stock numeric(14,3) not null default 0 check (min_stock >= 0),
  -- Số ngày báo trước khi lô hết hạn: cấu hình theo từng vật tư.
  expiry_warning_days integer not null default 30 check (expiry_warning_days between 0 and 3650),
  is_active boolean not null default true,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.lab_supply_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  item_id uuid not null references public.lab_supply_items(id),
  lot_number text not null check (char_length(btrim(lot_number)) between 1 and 80),
  expiry_date date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, item_id, lot_number)
);

create index if not exists lab_supply_lots_item_idx on public.lab_supply_lots(item_id);

create table if not exists public.lab_supply_period_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  period_end date not null,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, period_end)
);

create table if not exists public.lab_supply_stocktakes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  stocktake_date date not null,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.lab_supply_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  item_id uuid not null references public.lab_supply_items(id),
  lot_id uuid not null references public.lab_supply_lots(id),
  movement_type text not null check (movement_type in ('RECEIPT','ISSUE','DISPOSAL','ADJUST')),
  -- Có dấu: nhập > 0, xuất dùng/hủy < 0, điều chỉnh (kiểm kê/hao hụt) khác 0.
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  movement_date date not null,
  reference_no text,
  -- Nhập: nhà cung cấp. Xuất dùng: người nhận/nơi sử dụng.
  counterparty text,
  reason_code text check (reason_code in ('EXPIRED','DAMAGED','CONTAMINATED','OTHER','STOCKTAKE','SHRINKAGE','CORRECTION')),
  note text,
  stocktake_id uuid references public.lab_supply_stocktakes(id),
  system_quantity numeric(14,3),
  counted_quantity numeric(14,3),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint lab_supply_movements_sign_check check (
    (movement_type = 'RECEIPT' and quantity_delta > 0)
    or (movement_type in ('ISSUE','DISPOSAL') and quantity_delta < 0)
    or movement_type = 'ADJUST'
  ),
  constraint lab_supply_movements_reason_check check (
    (movement_type = 'DISPOSAL' and reason_code in ('EXPIRED','DAMAGED','CONTAMINATED','OTHER'))
    or (movement_type = 'ADJUST' and reason_code in ('STOCKTAKE','SHRINKAGE','CORRECTION'))
    or (movement_type in ('RECEIPT','ISSUE') and reason_code is null)
  ),
  constraint lab_supply_movements_note_check check (
    movement_type not in ('DISPOSAL','ADJUST') or reason_code = 'STOCKTAKE' or char_length(btrim(coalesce(note, ''))) >= 3
  )
);

create index if not exists lab_supply_movements_org_date_idx on public.lab_supply_movements(organization_id, movement_date desc, created_at desc);
create index if not exists lab_supply_movements_lot_idx on public.lab_supply_movements(lot_id);
create index if not exists lab_supply_movements_item_idx on public.lab_supply_movements(item_id, movement_date);

create table if not exists public.lab_supply_stocktake_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  stocktake_id uuid not null references public.lab_supply_stocktakes(id),
  lot_id uuid not null references public.lab_supply_lots(id),
  system_quantity numeric(14,3) not null,
  counted_quantity numeric(14,3) not null check (counted_quantity >= 0),
  difference numeric(14,3) not null,
  unique (stocktake_id, lot_id)
);

-- Sổ xuất nhập, kiểm kê và chốt kỳ là bằng chứng: không sửa/xóa.
create or replace function public.lab_supply_immutable_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Sổ kho hóa chất/VTYT không được sửa hoặc xóa; hãy tạo dòng điều chỉnh mới.';
end;
$$;

drop trigger if exists lab_supply_movements_immutable on public.lab_supply_movements;
create trigger lab_supply_movements_immutable before update or delete on public.lab_supply_movements
  for each row execute function public.lab_supply_immutable_guard();
drop trigger if exists lab_supply_stocktake_lines_immutable on public.lab_supply_stocktake_lines;
create trigger lab_supply_stocktake_lines_immutable before update or delete on public.lab_supply_stocktake_lines
  for each row execute function public.lab_supply_immutable_guard();
drop trigger if exists lab_supply_stocktakes_immutable on public.lab_supply_stocktakes;
create trigger lab_supply_stocktakes_immutable before update or delete on public.lab_supply_stocktakes
  for each row execute function public.lab_supply_immutable_guard();
drop trigger if exists lab_supply_closings_immutable on public.lab_supply_period_closings;
create trigger lab_supply_closings_immutable before update or delete on public.lab_supply_period_closings
  for each row execute function public.lab_supply_immutable_guard();

-- Lô: số lô/hạn dùng/vật tư không đổi sau khi tạo (sửa sai = nhập lô mới + hủy lô cũ).
create or replace function public.lab_supply_lot_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Không được xóa lô hóa chất/VTYT.';
  end if;
  if new.item_id is distinct from old.item_id
     or new.lot_number is distinct from old.lot_number
     or new.expiry_date is distinct from old.expiry_date
     or new.organization_id is distinct from old.organization_id then
    raise exception 'Không được sửa số lô/hạn dùng của lô đã tạo.';
  end if;
  return new;
end;
$$;

drop trigger if exists lab_supply_lots_guard on public.lab_supply_lots;
create trigger lab_supply_lots_guard before update or delete on public.lab_supply_lots
  for each row execute function public.lab_supply_lot_guard();

-- Tồn theo lô = tổng sổ xuất nhập (không có cột tồn lưu sẵn).
create or replace view public.lab_supply_lot_balances with (security_invoker = true) as
select
  l.id as lot_id,
  l.organization_id,
  l.item_id,
  l.lot_number,
  l.expiry_date,
  l.created_at,
  coalesce(sum(m.quantity_delta), 0)::numeric(14,3) as balance
from public.lab_supply_lots l
left join public.lab_supply_movements m on m.lot_id = l.id
group by l.id;

alter table public.lab_supply_items enable row level security;
alter table public.lab_supply_lots enable row level security;
alter table public.lab_supply_movements enable row level security;
alter table public.lab_supply_period_closings enable row level security;
alter table public.lab_supply_stocktakes enable row level security;
alter table public.lab_supply_stocktake_lines enable row level security;

drop policy if exists qlcl_authenticated_select on public.lab_supply_items;
create policy qlcl_authenticated_select on public.lab_supply_items for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));
drop policy if exists qlcl_authenticated_select on public.lab_supply_lots;
create policy qlcl_authenticated_select on public.lab_supply_lots for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));
drop policy if exists qlcl_authenticated_select on public.lab_supply_movements;
create policy qlcl_authenticated_select on public.lab_supply_movements for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));
drop policy if exists qlcl_authenticated_select on public.lab_supply_period_closings;
create policy qlcl_authenticated_select on public.lab_supply_period_closings for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));
drop policy if exists qlcl_authenticated_select on public.lab_supply_stocktakes;
create policy qlcl_authenticated_select on public.lab_supply_stocktakes for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));
drop policy if exists qlcl_authenticated_select on public.lab_supply_stocktake_lines;
create policy qlcl_authenticated_select on public.lab_supply_stocktake_lines for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Nhập kho: tạo lô mới hoặc cộng vào lô đã có (cùng số lô phải cùng hạn dùng).
-- ---------------------------------------------------------------------------
create or replace function public.qlcl_lab_supply_receive_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_item_id uuid,
  p_lot_number text,
  p_expiry_date date,
  p_quantity numeric,
  p_movement_date date,
  p_reference_no text,
  p_counterparty text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_org uuid;
  v_actor_active boolean;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_item public.lab_supply_items%rowtype;
  v_lot public.lab_supply_lots%rowtype;
  v_lot_number text := btrim(coalesce(p_lot_number, ''));
  v_movement_id uuid;
begin
  if p_organization_id is null or p_actor_user_id is null or p_item_id is null or p_movement_date is null then
    raise exception 'Thiếu tham số nhập kho';
  end if;
  select organization_id, is_active into v_actor_org, v_actor_active from public.profiles where user_id = p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active, false) or v_actor_org <> p_organization_id then
    raise exception 'Người thực hiện không thuộc tổ chức hoặc đã bị khóa';
  end if;

  perform pg_advisory_xact_lock(hashtext('lab_supply:' || p_organization_id::text));

  if p_quantity is null or p_quantity <= 0 then raise exception 'Số lượng nhập phải lớn hơn 0'; end if;
  if v_lot_number = '' then raise exception 'Số lô là bắt buộc'; end if;
  if p_movement_date > v_today then raise exception 'Ngày nhập không được ở tương lai'; end if;
  if exists (select 1 from public.lab_supply_period_closings where organization_id = p_organization_id and period_end >= p_movement_date) then
    raise exception 'Ngày nhập thuộc kỳ đã chốt';
  end if;

  select * into v_item from public.lab_supply_items where id = p_item_id for update;
  if not found or v_item.organization_id <> p_organization_id then raise exception 'Không tìm thấy vật tư trong tổ chức'; end if;
  if not v_item.is_active then raise exception 'Vật tư đã ngưng sử dụng'; end if;
  if v_item.category in ('REAGENT','CONTROL_CALIBRATOR') and p_expiry_date is null then
    raise exception 'Hóa chất/chất chuẩn/chất kiểm soát bắt buộc có hạn dùng';
  end if;
  if p_expiry_date is not null and p_expiry_date < p_movement_date then
    raise exception 'Hạn dùng của lô đã qua, không được nhập kho';
  end if;

  select * into v_lot from public.lab_supply_lots
  where organization_id = p_organization_id and item_id = p_item_id and lot_number = v_lot_number
  for update;
  if found then
    if v_lot.expiry_date is distinct from p_expiry_date then
      raise exception 'Lô % đã có với hạn dùng khác', v_lot_number;
    end if;
  else
    insert into public.lab_supply_lots(organization_id, item_id, lot_number, expiry_date, created_by)
    values (p_organization_id, p_item_id, v_lot_number, p_expiry_date, p_actor_user_id)
    returning * into v_lot;
  end if;

  insert into public.lab_supply_movements(
    organization_id, item_id, lot_id, movement_type, quantity_delta, movement_date,
    reference_no, counterparty, note, created_by
  ) values (
    p_organization_id, p_item_id, v_lot.id, 'RECEIPT', p_quantity, p_movement_date,
    nullif(btrim(coalesce(p_reference_no, '')), ''), nullif(btrim(coalesce(p_counterparty, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''), p_actor_user_id
  ) returning id into v_movement_id;

  return jsonb_build_object('ok', true, 'movement_id', v_movement_id, 'lot_id', v_lot.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Xuất dùng / hủy hàng / điều chỉnh (hao hụt, sửa sai) trên một lô.
-- p_quantity_delta có dấu: ISSUE/DISPOSAL < 0, ADJUST khác 0.
-- ---------------------------------------------------------------------------
create or replace function public.qlcl_lab_supply_post_movement_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lot_id uuid,
  p_movement_type text,
  p_quantity_delta numeric,
  p_movement_date date,
  p_reference_no text,
  p_counterparty text,
  p_reason_code text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_org uuid;
  v_actor_active boolean;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_lot public.lab_supply_lots%rowtype;
  v_item public.lab_supply_items%rowtype;
  v_balance numeric;
  v_movement_id uuid;
begin
  if p_organization_id is null or p_actor_user_id is null or p_lot_id is null or p_movement_date is null then
    raise exception 'Thiếu tham số phiếu kho';
  end if;
  if p_movement_type not in ('ISSUE','DISPOSAL','ADJUST') then
    raise exception 'Loại phiếu không hợp lệ (nhập kho dùng hàm nhập riêng)';
  end if;
  select organization_id, is_active into v_actor_org, v_actor_active from public.profiles where user_id = p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active, false) or v_actor_org <> p_organization_id then
    raise exception 'Người thực hiện không thuộc tổ chức hoặc đã bị khóa';
  end if;

  perform pg_advisory_xact_lock(hashtext('lab_supply:' || p_organization_id::text));

  if p_quantity_delta is null or p_quantity_delta = 0 then raise exception 'Số lượng phải khác 0'; end if;
  if p_movement_type in ('ISSUE','DISPOSAL') and p_quantity_delta >= 0 then raise exception 'Số lượng xuất/hủy phải là số âm trong sổ'; end if;
  if p_movement_date > v_today then raise exception 'Ngày phiếu không được ở tương lai'; end if;
  if exists (select 1 from public.lab_supply_period_closings where organization_id = p_organization_id and period_end >= p_movement_date) then
    raise exception 'Ngày phiếu thuộc kỳ đã chốt';
  end if;

  select * into v_lot from public.lab_supply_lots where id = p_lot_id for update;
  if not found or v_lot.organization_id <> p_organization_id then raise exception 'Không tìm thấy lô trong tổ chức'; end if;
  select * into v_item from public.lab_supply_items where id = v_lot.item_id;

  if p_movement_type = 'ISSUE' then
    if not v_item.is_active then raise exception 'Vật tư đã ngưng sử dụng'; end if;
    -- Điều khiển an toàn: không cấp phát hóa chất/VTYT đã hết hạn cho xét nghiệm.
    if v_lot.expiry_date is not null and v_lot.expiry_date < p_movement_date then
      raise exception 'Lô % đã hết hạn dùng, không được xuất dùng; hãy lập phiếu hủy hàng', v_lot.lot_number;
    end if;
    if char_length(btrim(coalesce(p_counterparty, ''))) < 2 then
      raise exception 'Xuất dùng phải ghi người nhận/nơi sử dụng';
    end if;
  end if;

  select coalesce(sum(quantity_delta), 0) into v_balance from public.lab_supply_movements where lot_id = p_lot_id;
  if v_balance + p_quantity_delta < 0 then
    raise exception 'Tồn lô % không đủ (hiện còn %)', v_lot.lot_number, v_balance;
  end if;

  insert into public.lab_supply_movements(
    organization_id, item_id, lot_id, movement_type, quantity_delta, movement_date,
    reference_no, counterparty, reason_code, note, created_by
  ) values (
    p_organization_id, v_lot.item_id, p_lot_id, p_movement_type, p_quantity_delta, p_movement_date,
    nullif(btrim(coalesce(p_reference_no, '')), ''), nullif(btrim(coalesce(p_counterparty, '')), ''),
    nullif(btrim(coalesce(p_reason_code, '')), ''), nullif(btrim(coalesce(p_note, '')), ''), p_actor_user_id
  ) returning id into v_movement_id;

  return jsonb_build_object('ok', true, 'movement_id', v_movement_id, 'balance_after', v_balance + p_quantity_delta);
end;
$$;

-- ---------------------------------------------------------------------------
-- Kiểm kê: ghi số đếm thực tế theo lô; chênh lệch tự sinh dòng ADJUST.
-- p_lines = [{ "lot_id": "...", "counted_quantity": 12.5 }, ...]
-- ---------------------------------------------------------------------------
create or replace function public.qlcl_lab_supply_stocktake_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_note text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_org uuid;
  v_actor_active boolean;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_stocktake_id uuid;
  v_line jsonb;
  v_lot public.lab_supply_lots%rowtype;
  v_counted numeric;
  v_system numeric;
  v_diff numeric;
  v_adjusted integer := 0;
  v_seen uuid[] := '{}';
begin
  if p_organization_id is null or p_actor_user_id is null then raise exception 'Thiếu tham số kiểm kê'; end if;
  select organization_id, is_active into v_actor_org, v_actor_active from public.profiles where user_id = p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active, false) or v_actor_org <> p_organization_id then
    raise exception 'Người thực hiện không thuộc tổ chức hoặc đã bị khóa';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Phiếu kiểm kê chưa có dòng nào';
  end if;

  perform pg_advisory_xact_lock(hashtext('lab_supply:' || p_organization_id::text));

  if exists (select 1 from public.lab_supply_period_closings where organization_id = p_organization_id and period_end >= v_today) then
    raise exception 'Ngày hôm nay thuộc kỳ đã chốt';
  end if;

  insert into public.lab_supply_stocktakes(organization_id, stocktake_date, note, created_by)
  values (p_organization_id, v_today, nullif(btrim(coalesce(p_note, '')), ''), p_actor_user_id)
  returning id into v_stocktake_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_counted := (v_line ->> 'counted_quantity')::numeric;
    if v_counted is null or v_counted < 0 then raise exception 'Số đếm thực tế không hợp lệ'; end if;

    select * into v_lot from public.lab_supply_lots where id = (v_line ->> 'lot_id')::uuid for update;
    if not found or v_lot.organization_id <> p_organization_id then raise exception 'Không tìm thấy lô trong tổ chức'; end if;
    if v_lot.id = any(v_seen) then raise exception 'Lô % xuất hiện 2 lần trong phiếu kiểm kê', v_lot.lot_number; end if;
    v_seen := v_seen || v_lot.id;

    select coalesce(sum(quantity_delta), 0) into v_system from public.lab_supply_movements where lot_id = v_lot.id;
    v_diff := v_counted - v_system;

    insert into public.lab_supply_stocktake_lines(organization_id, stocktake_id, lot_id, system_quantity, counted_quantity, difference)
    values (p_organization_id, v_stocktake_id, v_lot.id, v_system, v_counted, v_diff);

    if v_diff <> 0 then
      insert into public.lab_supply_movements(
        organization_id, item_id, lot_id, movement_type, quantity_delta, movement_date,
        reason_code, note, stocktake_id, system_quantity, counted_quantity, created_by
      ) values (
        p_organization_id, v_lot.item_id, v_lot.id, 'ADJUST', v_diff, v_today,
        'STOCKTAKE', 'Chênh lệch kiểm kê', v_stocktake_id, v_system, v_counted, p_actor_user_id
      );
      v_adjusted := v_adjusted + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'stocktake_id', v_stocktake_id, 'lines', jsonb_array_length(p_lines), 'adjusted', v_adjusted);
end;
$$;

-- ---------------------------------------------------------------------------
-- Chốt kỳ: sau khi chốt đến ngày D, không ghi thêm dòng có ngày <= D.
-- ---------------------------------------------------------------------------
create or replace function public.qlcl_lab_supply_close_period_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_period_end date,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_org uuid;
  v_actor_active boolean;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_last date;
  v_id uuid;
begin
  if p_organization_id is null or p_actor_user_id is null or p_period_end is null then raise exception 'Thiếu tham số chốt kỳ'; end if;
  select organization_id, is_active into v_actor_org, v_actor_active from public.profiles where user_id = p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active, false) or v_actor_org <> p_organization_id then
    raise exception 'Người thực hiện không thuộc tổ chức hoặc đã bị khóa';
  end if;

  perform pg_advisory_xact_lock(hashtext('lab_supply:' || p_organization_id::text));

  if p_period_end > v_today then raise exception 'Không chốt kỳ ở tương lai'; end if;
  select max(period_end) into v_last from public.lab_supply_period_closings where organization_id = p_organization_id;
  if v_last is not null and p_period_end <= v_last then
    raise exception 'Ngày chốt phải sau kỳ đã chốt gần nhất (%)', v_last;
  end if;

  insert into public.lab_supply_period_closings(organization_id, period_end, note, created_by)
  values (p_organization_id, p_period_end, nullif(btrim(coalesce(p_note, '')), ''), p_actor_user_id)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'closing_id', v_id, 'period_end', p_period_end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Báo cáo Nhập – Xuất – Tồn theo kỳ, tính trực tiếp từ sổ (tồn đầu kỳ = tổng
-- các dòng có ngày trước kỳ; không có số tồn nhập tay).
-- ---------------------------------------------------------------------------
create or replace function public.qlcl_lab_supply_period_report_v1(
  p_organization_id uuid,
  p_from date,
  p_to date
)
returns table (
  item_id uuid,
  code text,
  name text,
  unit text,
  category text,
  is_active boolean,
  min_stock numeric,
  opening numeric,
  receipts numeric,
  issues numeric,
  disposals numeric,
  adjustments numeric,
  closing numeric
)
language sql
stable
set search_path = ''
as $$
  select
    i.id,
    i.code,
    i.name,
    i.unit,
    i.category,
    i.is_active,
    i.min_stock,
    coalesce(sum(m.quantity_delta) filter (where m.movement_date < p_from), 0),
    coalesce(sum(m.quantity_delta) filter (where m.movement_type = 'RECEIPT' and m.movement_date between p_from and p_to), 0),
    coalesce(-sum(m.quantity_delta) filter (where m.movement_type = 'ISSUE' and m.movement_date between p_from and p_to), 0),
    coalesce(-sum(m.quantity_delta) filter (where m.movement_type = 'DISPOSAL' and m.movement_date between p_from and p_to), 0),
    coalesce(sum(m.quantity_delta) filter (where m.movement_type = 'ADJUST' and m.movement_date between p_from and p_to), 0),
    coalesce(sum(m.quantity_delta) filter (where m.movement_date <= p_to), 0)
  from public.lab_supply_items i
  left join public.lab_supply_movements m on m.item_id = i.id and m.organization_id = p_organization_id
  where i.organization_id = p_organization_id
  group by i.id
  order by i.code;
$$;

revoke execute on function public.qlcl_lab_supply_receive_v1(uuid,uuid,uuid,text,date,numeric,date,text,text,text) from public, anon, authenticated;
grant execute on function public.qlcl_lab_supply_receive_v1(uuid,uuid,uuid,text,date,numeric,date,text,text,text) to service_role;
revoke execute on function public.qlcl_lab_supply_post_movement_v1(uuid,uuid,uuid,text,numeric,date,text,text,text,text) from public, anon, authenticated;
grant execute on function public.qlcl_lab_supply_post_movement_v1(uuid,uuid,uuid,text,numeric,date,text,text,text,text) to service_role;
revoke execute on function public.qlcl_lab_supply_stocktake_v1(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.qlcl_lab_supply_stocktake_v1(uuid,uuid,text,jsonb) to service_role;
revoke execute on function public.qlcl_lab_supply_close_period_v1(uuid,uuid,date,text) from public, anon, authenticated;
grant execute on function public.qlcl_lab_supply_close_period_v1(uuid,uuid,date,text) to service_role;
revoke execute on function public.qlcl_lab_supply_period_report_v1(uuid,date,date) from public, anon, authenticated;
grant execute on function public.qlcl_lab_supply_period_report_v1(uuid,date,date) to service_role;

insert into public.permissions(code,name,description,module,is_active) values
('lab_supplies.view','Xem kho hóa chất/VTYT xét nghiệm','Xem danh mục, tồn kho theo lô, sổ xuất nhập và báo cáo Nhập–Xuất–Tồn trong phạm vi tổ chức.','lab_supplies',true),
('lab_supplies.manage','Quản lý kho hóa chất/VTYT xét nghiệm','Thêm vật tư, nhập/xuất/hủy/điều chỉnh, kiểm kê và chốt kỳ kho hóa chất/VTYT trong phạm vi tổ chức.','lab_supplies',true)
on conflict(code) do update set name=excluded.name,description=excluded.description,module=excluded.module,is_active=true;

-- Quyền mặc định neo giống module Sổ quản lý TTBYT (xem: ai có tasks.view;
-- quản lý: ai có plans.manage). Quản trị viên điều chỉnh theo vai trò thực tế
-- của khoa Xét nghiệm trong màn hình phân quyền.
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='tasks.view'
join public.permissions p_new on p_new.code='lab_supplies.view'
on conflict(role_id,permission_id) do nothing;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.code='plans.manage'
join public.permissions p_new on p_new.code='lab_supplies.manage'
on conflict(role_id,permission_id) do nothing;
