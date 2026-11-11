-- "Muốn xem 1 người thì làm sao tra cứu bao nhiêu điểm, sai câu nào đúng câu
-- nào. kỳ thi nào" — thiết kế trước (pre_test_score/post_test_score là 2
-- cột cố định trên procedure_training_attendees) không mở rộng được quá 2
-- đợt kiểm tra, và không lưu câu trả lời từng câu nên không tra được
-- đúng/sai. Đổi sang 3 bảng:
--   - procedure_training_rounds: 1 đợt đào tạo có N đợt kiểm tra (Pre-test,
--     Post-test, kiểm tra định kỳ...), không giới hạn 2.
--   - procedure_training_results: điểm của 1 người trong 1 đợt kiểm tra cụ
--     thể (1 hàng/người/đợt, không phải 1 hàng/người/đào tạo nữa).
--   - procedure_training_responses: câu trả lời + đúng/sai từng câu của 1
--     kết quả cụ thể — tra được "câu nào sai, chọn gì, đáp án đúng là gì".
create table if not exists public.procedure_training_rounds (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.procedure_trainings(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  round_label text not null check (char_length(btrim(round_label)) between 1 and 200),
  round_date date,
  score_max numeric check (score_max is null or score_max > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique(training_id, round_label)
);

create index if not exists procedure_training_rounds_training_idx
  on public.procedure_training_rounds(training_id);

alter table public.procedure_training_rounds enable row level security;

drop policy if exists qlcl_authenticated_select on public.procedure_training_rounds;
create policy qlcl_authenticated_select on public.procedure_training_rounds
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

create table if not exists public.procedure_training_results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.procedure_training_rounds(id) on delete cascade,
  attendee_id uuid not null references public.procedure_training_attendees(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  score numeric check (score is null or score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(round_id, attendee_id)
);

create index if not exists procedure_training_results_attendee_idx
  on public.procedure_training_results(attendee_id);
create index if not exists procedure_training_results_round_idx
  on public.procedure_training_results(round_id);

alter table public.procedure_training_results enable row level security;

drop policy if exists qlcl_authenticated_select on public.procedure_training_results;
create policy qlcl_authenticated_select on public.procedure_training_results
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

create table if not exists public.procedure_training_responses (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.procedure_training_results(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  question_no int not null check (question_no > 0),
  answer_text text,
  is_correct boolean,
  unique(result_id, question_no)
);

create index if not exists procedure_training_responses_result_idx
  on public.procedure_training_responses(result_id);

alter table public.procedure_training_responses enable row level security;

drop policy if exists qlcl_authenticated_select on public.procedure_training_responses;
create policy qlcl_authenticated_select on public.procedure_training_responses
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));

-- Backfill dữ liệu thật đã nhập trước đó (báo cáo Pre/Post-test ATPT-HSBA,
-- 25 người) từ 2 cột cũ sang rounds + results, rồi bỏ 2 cột cũ — điểm số
-- giờ chỉ sống ở procedure_training_results (CLAUDE.md nguyên tắc 2: một
-- nghiệp vụ chỉ có một nguồn sự thật).
insert into public.procedure_training_rounds (training_id, organization_id, round_label, sort_order)
select distinct a.training_id, a.organization_id, 'Pre-test', 1
from public.procedure_training_attendees a
where a.pre_test_score is not null
on conflict (training_id, round_label) do nothing;

insert into public.procedure_training_rounds (training_id, organization_id, round_label, sort_order)
select distinct a.training_id, a.organization_id, 'Post-test', 2
from public.procedure_training_attendees a
where a.post_test_score is not null
on conflict (training_id, round_label) do nothing;

insert into public.procedure_training_results (round_id, attendee_id, organization_id, score)
select r.id, a.id, a.organization_id, a.pre_test_score
from public.procedure_training_attendees a
join public.procedure_training_rounds r on r.training_id = a.training_id and r.round_label = 'Pre-test'
where a.pre_test_score is not null
on conflict (round_id, attendee_id) do nothing;

insert into public.procedure_training_results (round_id, attendee_id, organization_id, score)
select r.id, a.id, a.organization_id, a.post_test_score
from public.procedure_training_attendees a
join public.procedure_training_rounds r on r.training_id = a.training_id and r.round_label = 'Post-test'
where a.post_test_score is not null
on conflict (round_id, attendee_id) do nothing;

alter table public.procedure_training_attendees drop column if exists pre_test_score;
alter table public.procedure_training_attendees drop column if exists post_test_score;
