-- Quản lý đoàn thẩm định/tiếp đoàn — tích hợp vào module "Đánh giá ngoài" có
-- sẵn (external_assessment_events), không xây module song song. Mỗi đợt
-- đánh giá ngoài (external_assessment_event) có thể có nhiều thành viên đoàn,
-- mỗi thành viên có thể được phân công 1 người nội bộ tiếp đón. Các trường
-- thời gian/địa điểm đón giữ dạng text tự do vì dữ liệu thật không đồng nhất
-- ("Tự đi", "Đi chung Đoàn với Sở", địa chỉ cụ thể...). Không cần permission
-- mới — dùng chung criteria.view/criteria.review/criteria.manage đã gate
-- toàn bộ module Đánh giá ngoài.
create table if not exists public.external_assessment_delegates (
  id uuid primary key default gen_random_uuid(),
  external_assessment_event_id uuid not null references public.external_assessment_events(id) on delete cascade,
  sort_order int not null default 0,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 200),
  title text,
  organization text,
  specialty_area text,
  phone text,
  host_name text,
  pickup_time text,
  pickup_location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists external_assessment_delegates_event_idx
  on public.external_assessment_delegates(external_assessment_event_id, sort_order);

alter table public.external_assessment_delegates enable row level security;

drop policy if exists qlcl_authenticated_select on public.external_assessment_delegates;
create policy qlcl_authenticated_select on public.external_assessment_delegates
for select to authenticated
using (exists (
  select 1 from public.external_assessment_events e
  join public.records r on r.id = e.record_id
  where e.id = external_assessment_delegates.external_assessment_event_id
    and r.organization_id = (select organization_id from public.profiles where user_id = auth.uid())
));
