-- procedure_trainings trước đây chỉ có MỘT trạng thái chung
-- (TRAINED/PLANNED/NOT_PLANNED) cho cả quy trình — không trả lời được "bao
-- nhiêu % nhân sự khoa/phòng đã thực sự được đào tạo", đúng như báo cáo thẩm
-- định chỉ ra. Thêm bảng con theo từng nhân viên để tính tỷ lệ hoàn thành
-- (đã đào tạo / tổng số đăng ký), không thay đổi ý nghĩa của status hiện có
-- (status vẫn là tình trạng tổng thể của đợt đào tạo quy trình đó).
create table if not exists public.procedure_training_attendees (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.procedure_trainings(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  employee_name text not null check (char_length(btrim(employee_name)) between 1 and 200),
  employee_code text,
  attended boolean not null default false,
  attended_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists procedure_training_attendees_training_idx
  on public.procedure_training_attendees(training_id);

alter table public.procedure_training_attendees enable row level security;

drop policy if exists qlcl_authenticated_select on public.procedure_training_attendees;
create policy qlcl_authenticated_select on public.procedure_training_attendees
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));
