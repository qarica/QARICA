-- QARICA deny-by-design grant hardening.
-- These tables are accessed through server-side/admin flows; RLS intentionally has no client policy.
revoke all on table public.fmea_failure_mode_action_links from public, anon, authenticated;
revoke all on table public.program_reference_links from public, anon, authenticated;

grant select, insert, update, delete on table public.fmea_failure_mode_action_links to service_role;
grant select, insert, update, delete on table public.program_reference_links to service_role;
