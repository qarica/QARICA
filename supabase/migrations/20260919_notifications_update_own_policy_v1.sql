-- Notifications table only had a SELECT policy (qlcl_authenticated_select). Marking a
-- notification as read requires UPDATE, which was silently rejected by RLS with 0 rows
-- affected (not a visible error) - the bell showed "read" for a moment then reverted on
-- the next 5s poll. This lets an authenticated user update only their own notifications.
create policy qlcl_authenticated_update_own
on public.notifications
for update
to authenticated
using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());
