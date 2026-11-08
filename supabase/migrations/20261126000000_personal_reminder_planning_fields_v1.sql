-- Yêu cầu tường minh: áp dụng khung 5W1H/SMART/Eisenhower vào QARICA, bắt đầu
-- từ "Việc cá nhân" (personal_reminders) — mỗi note chỉ có 1 chủ nên KHÔNG
-- thêm RACI ở đây (RACI cần nhiều người/vai trò, xem module work_plans
-- riêng cho việc nhóm). What/Who/When đã có sẵn (title/owner_user_id/due_at)
-- nên chỉ thêm 3 cột 5W1H còn thiếu + 1 cột SMART (Measurable) — Specific đã
-- là title, Achievable/Relevant là phán đoán của người dùng lúc viết, không
-- cần cột riêng. Eisenhower (P1-P4) KHÔNG thêm cột — tính toán (computed) từ
-- priority (importance) + due_at so với hôm nay (urgency), giống cách
-- incoming_documents tính "Trạng thái" từ due_date/completed_at thay vì lưu
-- tay (tránh lệch giữa priority và quadrant khi 1 cái đổi mà cái kia quên
-- cập nhật — một nghiệp vụ chỉ có một nguồn sự thật).
alter table public.personal_reminders add column if not exists why_text text;
alter table public.personal_reminders add column if not exists where_text text;
alter table public.personal_reminders add column if not exists how_text text;
alter table public.personal_reminders add column if not exists smart_target text;
