-- RECONCILIATION: đã áp trực tiếp lên Supabase sống ngày 2026-10-07, không qua repo.
-- Đây là fix gốc (DB-level) cho đúng bug PostgREST ambiguous-embed mà src/lib/auth.ts
-- cũng đã được vá ở tầng application (commit 3b3fdc3, 2026-10-11) — migration DB này
-- chạy trước 4 ngày. Giữ cả 2 lớp vá (DB + application fail-closed) làm defense-in-depth.
alter table public.profiles
  drop constraint if exists profiles_department_id_fkey;
