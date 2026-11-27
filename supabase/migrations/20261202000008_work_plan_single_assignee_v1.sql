-- Bỏ RACI khỏi Kế hoạch công việc: mỗi đầu việc chỉ có MỘT người phụ trách.
-- Một nguồn sự thật: work_plan_items.assignee_user_id thay cho bảng work_plan_item_raci.
-- Backfill an toàn: nếu còn dữ liệu RACI thì lấy người chữ A (ưu tiên), không có A thì lấy R đầu tiên.

alter table public.work_plan_items
  add column if not exists assignee_user_id uuid references auth.users(id) on delete set null;

do $$
begin
  if to_regclass('public.work_plan_item_raci') is not null then
    update public.work_plan_items i
       set assignee_user_id = coalesce(
         (select r.user_id from public.work_plan_item_raci r where r.work_plan_item_id = i.id and r.raci_role = 'A' limit 1),
         (select r.user_id from public.work_plan_item_raci r where r.work_plan_item_id = i.id and r.raci_role = 'R' order by r.created_at limit 1)
       )
     where i.assignee_user_id is null;
  end if;
end $$;

create index if not exists work_plan_items_assignee_idx on public.work_plan_items(assignee_user_id);

drop table if exists public.work_plan_item_raci;

update public.permissions set description = 'Xem danh sách kế hoạch công việc, đầu việc và người phụ trách trong phạm vi tổ chức.' where code = 'work_plans.view';
update public.permissions set description = 'Tạo/sửa kế hoạch, đầu việc và người phụ trách trong phạm vi tổ chức.' where code = 'work_plans.manage';
