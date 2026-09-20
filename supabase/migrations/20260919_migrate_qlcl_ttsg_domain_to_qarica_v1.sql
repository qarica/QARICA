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
