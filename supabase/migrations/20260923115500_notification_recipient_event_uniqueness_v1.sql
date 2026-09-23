-- Notifications are unique per recipient + event, not globally per event.
-- A workflow event may legitimately notify multiple users.

alter table public.notifications
  drop constraint if exists notifications_notification_event_key_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.notifications'::regclass
      and conname='notifications_recipient_event_key_key2'
      and contype='u'
  ) then
    alter table public.notifications
      add constraint notifications_recipient_event_key_key2
      unique (recipient_user_id, notification_event_key);
  end if;
end
$$;
