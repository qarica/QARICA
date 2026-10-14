-- RECONCILIATION: đã áp trực tiếp lên Supabase sống ngày 2026-10-07, không qua repo.
-- File này chỉ ghi lại đúng nội dung đã chạy (đọc từ supabase_migrations.schema_migrations)
-- để repo khớp với thực tế production — KHÔNG chạy lại DDL mới.
drop policy if exists personal_reminders_owner_insert on public.personal_reminders;
create policy personal_reminders_owner_insert
on public.personal_reminders
for insert
to authenticated
with check (
  (select auth.uid()) = owner_user_id
  and organization_id = private.current_organization_id()
);

drop policy if exists personal_reminders_owner_update on public.personal_reminders;
create policy personal_reminders_owner_update
on public.personal_reminders
for update
to authenticated
using ((select auth.uid()) = owner_user_id)
with check (
  (select auth.uid()) = owner_user_id
  and organization_id = private.current_organization_id()
);
