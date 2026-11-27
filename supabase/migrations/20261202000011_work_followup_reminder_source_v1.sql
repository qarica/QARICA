-- "Chờ phản hồi" dùng được cho việc cá nhân (personal_reminders): thêm nguồn 'REMINDER' vào work_followups.
-- Không thêm bảng mới (một nguồn sự thật: work_followups). Chỉ chủ việc đánh dấu được (kiểm tra ở API + RLS owner của work_followups).
alter table public.work_followups drop constraint if exists work_followups_source_type_check;
alter table public.work_followups add constraint work_followups_source_type_check
  check (source_type in ('ACTION','EMR','RECORD','OTHER','REMINDER'));
