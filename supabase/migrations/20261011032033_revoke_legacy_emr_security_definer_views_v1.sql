-- RECONCILIATION: đã áp trực tiếp lên Supabase sống ngày 2026-10-11, không qua repo.
revoke all on table public.emr_form_rollout_summary from anon, authenticated;
revoke all on table public.emr_kpi_summary from anon, authenticated;
revoke all on table public.emr_open_issues_summary from anon, authenticated;
