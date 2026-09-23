-- NOTIFICATION_RECIPIENT_EVENT_UNIQUENESS_POSTCHECK_V1
select
  case when not exists (
    select 1 from pg_constraint
    where conrelid='public.notifications'::regclass
      and conname='notifications_notification_event_key_key'
  ) then 'PASS' else 'FAIL' end as global_event_unique_removed,
  case when exists (
    select 1 from pg_constraint
    where conrelid='public.notifications'::regclass
      and contype='u'
      and pg_get_constraintdef(oid)='UNIQUE (recipient_user_id, notification_event_key)'
  ) then 'PASS' else 'FAIL' end as recipient_event_unique_present;
