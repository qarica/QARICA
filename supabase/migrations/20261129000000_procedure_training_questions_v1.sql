-- "Ok em" (tiếp theo luồng import Pre/Post-test) — số câu hỏi mỗi đợt đào
-- tạo không giống nhau (17 câu cho ATPT, có thể 10/25 câu cho đợt khác), nên
-- đáp án đúng KHÔNG cố định số dòng — lưu dạng 1 hàng/câu, số câu bao nhiêu
-- tùy đợt. Đây là đáp án dùng để tự chấm điểm khi import file khảo sát thô
-- (mỗi cột câu hỏi là câu trả lời của người làm bài, so với đáp án đúng ở
-- đây để tính điểm) — khác với procedure_trainings.test_score_max (thang
-- điểm tối đa, 1 số duy nhất cho cả đợt, đã có từ migration trước).
create table if not exists public.procedure_training_questions (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.procedure_trainings(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  question_no int not null check (question_no > 0),
  correct_answer text not null check (char_length(btrim(correct_answer)) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique(training_id, question_no)
);

create index if not exists procedure_training_questions_training_idx
  on public.procedure_training_questions(training_id);

alter table public.procedure_training_questions enable row level security;

drop policy if exists qlcl_authenticated_select on public.procedure_training_questions;
create policy qlcl_authenticated_select on public.procedure_training_questions
for select to authenticated
using (organization_id = (select organization_id from public.profiles where user_id = auth.uid()));
