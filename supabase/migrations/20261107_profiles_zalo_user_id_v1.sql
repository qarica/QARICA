-- Mức 1 của đề xuất "đưa ý tưởng Javis OS vào QARICA": thêm kênh báo Zalo cho
-- thông báo cá nhân mức HIGH/URGENT/CRITICAL, bên cạnh chuông in-app hiện có.
-- Chỉ thêm cột — không đổi gì ở bảng profiles hiện có.
alter table public.profiles add column if not exists zalo_user_id text;
