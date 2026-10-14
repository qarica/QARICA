-- RECONCILIATION: đã áp trực tiếp lên Supabase sống ngày 2026-10-11 07:33, không qua repo.
-- Lần áp đầu tiên — 32 phút sau được áp lại (xem 20261011080617_notification_delivery_v1.sql).
create table if not exists public.notification_deliveries (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null references public.notifications(id) on delete cascade,
 recipient_user_id uuid not null references auth.users(id) on delete cascade,
 channel text not null check (channel in ('ZALO','EMAIL')),
 delivery_status text not null default 'QUEUED' check (delivery_status in ('QUEUED','SENDING','SENT','DELIVERED','FAILED','SKIPPED')),
 idempotency_key text not null,
 attempt_count integer not null default 0 check (attempt_count>=0),
 next_attempt_at timestamptz null,
 last_attempt_at timestamptz null,
 sent_at timestamptz null,
 delivered_at timestamptz null,
 provider_message_id text null,
 last_error text null,
 payload_class text not null default 'MINIMAL' check (payload_class in ('MINIMAL','STANDARD')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(channel,idempotency_key),
 unique(notification_id,channel)
);
create index if not exists notification_deliveries_retry_idx on public.notification_deliveries(delivery_status,next_attempt_at,recipient_user_id);
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon, authenticated;
