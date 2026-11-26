-- Kho hóa chất/VTYT XN: mở lại kỳ đã chốt (chỉ kỳ gần nhất, bắt buộc có lý do, lưu vết bất biến).
--
-- Chốt kỳ vốn không sửa/xóa được (trigger lab_supply_closings_immutable). Chốt nhầm thì kho kẹt:
-- không ghi bù được phiếu của kỳ đó. Thay vì nới lỏng trigger chung, chỉ cho phép XÓA một dòng chốt kỳ
-- khi hàm qlcl_lab_supply_reopen_period_v1 (service_role) đã ghi bản lưu vết vào
-- lab_supply_period_reopenings và bật cờ cục bộ của giao dịch. UPDATE vẫn bị chặn tuyệt đối.

create table if not exists public.lab_supply_period_reopenings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  closing_id uuid not null,
  period_end date not null,
  closing_note text,
  closed_by uuid,
  closed_at timestamptz,
  reason text not null check (char_length(btrim(reason)) >= 5),
  reopened_by uuid not null references auth.users(id),
  reopened_at timestamptz not null default now()
);

alter table public.lab_supply_period_reopenings enable row level security;
drop policy if exists qlcl_authenticated_select on public.lab_supply_period_reopenings;
create policy qlcl_authenticated_select on public.lab_supply_period_reopenings for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

drop trigger if exists lab_supply_reopenings_immutable on public.lab_supply_period_reopenings;
create trigger lab_supply_reopenings_immutable before update or delete on public.lab_supply_period_reopenings
  for each row execute function public.lab_supply_immutable_guard();

create or replace function public.lab_supply_closing_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('qlcl.lab_supply_reopen', true), '') = 'on' then
    return old;
  end if;
  raise exception 'Sổ kho hóa chất/VTYT không được sửa hoặc xóa; hãy tạo dòng điều chỉnh mới.';
end;
$$;

drop trigger if exists lab_supply_closings_immutable on public.lab_supply_period_closings;
create trigger lab_supply_closings_immutable before update or delete on public.lab_supply_period_closings
  for each row execute function public.lab_supply_closing_guard();

create or replace function public.qlcl_lab_supply_reopen_period_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_org uuid;
  v_actor_active boolean;
  v_closing public.lab_supply_period_closings%rowtype;
begin
  if p_organization_id is null or p_actor_user_id is null then
    raise exception 'Thiếu tham số mở lại kỳ';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Mở lại kỳ phải ghi lý do (ít nhất 5 ký tự)';
  end if;

  select organization_id, is_active into v_actor_org, v_actor_active from public.profiles where user_id = p_actor_user_id;
  if v_actor_org is null or not coalesce(v_actor_active, false) or v_actor_org <> p_organization_id then
    raise exception 'Người thực hiện không thuộc tổ chức hoặc đã bị khóa';
  end if;

  perform pg_advisory_xact_lock(hashtext('lab_supply:' || p_organization_id::text));

  select * into v_closing from public.lab_supply_period_closings
  where organization_id = p_organization_id
  order by period_end desc limit 1;
  if not found then
    raise exception 'Chưa có kỳ nào được chốt';
  end if;

  insert into public.lab_supply_period_reopenings(organization_id, closing_id, period_end, closing_note, closed_by, closed_at, reason, reopened_by)
  values (p_organization_id, v_closing.id, v_closing.period_end, v_closing.note, v_closing.created_by, v_closing.created_at, btrim(p_reason), p_actor_user_id);

  perform set_config('qlcl.lab_supply_reopen', 'on', true);
  delete from public.lab_supply_period_closings where id = v_closing.id;
  perform set_config('qlcl.lab_supply_reopen', 'off', true);

  return jsonb_build_object('ok', true, 'reopened_period_end', v_closing.period_end);
end;
$$;

revoke execute on function public.qlcl_lab_supply_reopen_period_v1(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.qlcl_lab_supply_reopen_period_v1(uuid, uuid, text) to service_role;
