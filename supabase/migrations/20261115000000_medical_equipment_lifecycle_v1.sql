-- Sổ quản lý TTBYT: bổ sung trạng thái 3 mức (Đang sử dụng/Bảo trì-Sửa
-- chữa/Ngưng sử dụng) thay cho is_active 2 mức, và bảng lịch sử bàn giao/
-- bảo trì theo từng thiết bị — tham khảo từ mẫu quản lý tài sản CNTT (QR
-- tra cứu, cấp phát/thu hồi/bàn giao, theo dõi bảo trì) do người dùng gửi,
-- áp dụng phần phù hợp với TTBYT (bỏ đồng bộ Active Directory — không áp
-- dụng cho thiết bị y tế).

alter table public.medical_equipment add column if not exists status text;
update public.medical_equipment set status = case when is_active then 'IN_USE' else 'INACTIVE' end where status is null;
alter table public.medical_equipment alter column status set not null;
alter table public.medical_equipment alter column status set default 'IN_USE';
alter table public.medical_equipment drop constraint if exists medical_equipment_status_check;
alter table public.medical_equipment add constraint medical_equipment_status_check
  check (status in ('IN_USE','MAINTENANCE','INACTIVE'));

-- is_active CHƯA drop được: "alter table ... drop column is_active" liên tục
-- timeout qua MCP tool trong phiên này (không phải lỗi SQL — DROP COLUMN kích
-- hoạt một bước xác nhận của tool không trả lời được, thử lại vẫn y hệt).
-- Cột này từ đây về sau không còn được code đọc/ghi (status là nguồn sự thật
-- duy nhất) — chỉ còn là cột thừa, vô hại, cho tới khi xoá được (SQL Editor
-- trực tiếp hoặc 1 migration sau). KHÔNG coi file này là đã drop is_active
-- trên production chỉ vì nằm trong migration — DB sống hiện vẫn còn cột này
-- (đã xác nhận qua information_schema), đúng nguyên tắc không suy ra trạng
-- thái production từ nội dung file migration.

-- Lịch sử bàn giao/bảo trì: mỗi dòng là 1 sự kiện trong vòng đời thiết bị.
-- ASSIGN/TRANSFER có to_department_id thì đồng bộ luôn medical_equipment.
-- department_id (khoa đang giữ thiết bị) — tránh 2 nguồn sự thật lệch nhau
-- giữa "khoa sử dụng hiện tại" và lịch sử bàn giao. MAINTENANCE_START/DONE
-- tương tự đồng bộ medical_equipment.status. RETURN/NOTE chỉ ghi log, không
-- có hiệu ứng tự động (không có khái niệm "chưa cấp phát cho ai" rõ ràng
-- với TTBYT, khác tài sản CNTT cấp cho từng cá nhân).
create table if not exists public.medical_equipment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  equipment_id uuid not null references public.medical_equipment(id) on delete cascade,
  event_type text not null check (event_type in ('ASSIGN','TRANSFER','RETURN','MAINTENANCE_START','MAINTENANCE_DONE','NOTE')),
  to_department_id uuid references public.departments(id),
  event_date date not null default current_date,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists medical_equipment_events_equipment_idx
  on public.medical_equipment_events(equipment_id, event_date desc, created_at desc);

alter table public.medical_equipment_events enable row level security;

drop policy if exists qlcl_authenticated_select on public.medical_equipment_events;
create policy qlcl_authenticated_select on public.medical_equipment_events
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));
