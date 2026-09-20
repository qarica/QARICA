-- 26 shared department/network accounts (admin, bgd01, cdha01, ...) were created before the
-- QARICA rebrand's synthetic-email domain change (qlcl-ttsg.com -> qarica.com). Account
-- creation (admin-users-client.tsx, admin/api/users/route.ts) had already switched to
-- qarica.com, but these existing rows kept their old email, and the login route was
-- separately fixed in commit 8b2a467 to build @qarica.com - leaving every pre-existing
-- username-only account unable to log in. Migrates both auth.users and public.profiles.

update auth.users au
set email = regexp_replace(au.email, '@qlcl-ttsg\.com$', '@qarica.com')
where au.email ilike '%@qlcl-ttsg.com'
  and not exists (
    select 1 from auth.users x
    where x.email = regexp_replace(au.email, '@qlcl-ttsg\.com$', '@qarica.com')
  );

update public.profiles p
set email = regexp_replace(p.email, '@qlcl-ttsg\.com$', '@qarica.com')
where p.email ilike '%@qlcl-ttsg.com'
  and not exists (
    select 1 from public.profiles x
    where x.email = regexp_replace(p.email, '@qlcl-ttsg\.com$', '@qarica.com')
  );

-- auth.users alone was not enough: Supabase Auth also keeps a copy of the email inside
-- auth.identities.identity_data (per sign-in provider), which stayed on the old domain
-- and caused every migrated account to still fail to authenticate.
update auth.identities
set identity_data = jsonb_set(
  identity_data, '{email}',
  to_jsonb(regexp_replace(identity_data->>'email', '@qlcl-ttsg\.com$', '@qarica.com'))
)
where identity_data->>'email' ilike '%@qlcl-ttsg.com';

-- auth.identities.identity_data.email alone was still not enough: for the "email" provider,
-- Supabase Auth also keys identities by provider_id (= the email itself), which stayed on
-- the old domain and caused signInWithPassword to fail with "Database error querying schema".
update auth.identities
set provider_id = regexp_replace(provider_id, '@qlcl-ttsg\.com$', '@qarica.com')
where provider = 'email' and provider_id ilike '%@qlcl-ttsg.com';

-- The REAL final blocker, found via GoTrue's own auth logs (not Postgres logs, which were
-- full of an unrelated periodic "invalid input syntax for type json" noise from Supabase's
-- own dashboard row-count estimator): "error finding user: sql: Scan error on column index 8,
-- name email_change: converting NULL to string is unsupported". Several auth.users text
-- columns were NULL instead of the '' GoTrue's Go driver requires, pre-dating this whole
-- domain migration and unrelated to it - login was broken for these accounts regardless.
update auth.users set
  email_change = coalesce(email_change, ''),
  phone_change = coalesce(phone_change, ''),
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, '')
where email_change is null
   or phone_change is null
   or confirmation_token is null
   or recovery_token is null
   or email_change_token_new is null
   or email_change_token_current is null
   or phone_change_token is null
   or reauthentication_token is null;
