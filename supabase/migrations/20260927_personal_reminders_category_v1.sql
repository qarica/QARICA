-- Add a category to personal reminders so the "Tạo note việc cá nhân" UI can
-- offer real, persisted category chips (Họp nội bộ / Theo dõi CAPA / Kiểm tra
-- hồ sơ / Nhắc nhở / Khác) instead of a decorative, non-functional control.
alter table public.personal_reminders
  add column if not exists category text not null default 'KHAC'
  check (category in ('HOP_NOI_BO','THEO_DOI_CAPA','KIEM_TRA_HO_SO','NHAC_NHO','KHAC'));
