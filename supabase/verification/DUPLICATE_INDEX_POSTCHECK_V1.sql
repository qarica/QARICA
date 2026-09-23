-- DUPLICATE_INDEX_POSTCHECK_V1
-- Expected: all three duplicate indexes are absent and canonical uniqueness remains.

select
  case when to_regclass('public.uq_indicator_definition_versions_no') is null then 'PASS' else 'FAIL' end as old_indicator_duplicate_removed,
  case when to_regclass('public.ux_indicator_definition_versions_number') is not null then 'PASS' else 'FAIL' end as indicator_canonical_kept,
  case when to_regclass('public.uq_rca_analyses_incident_id') is null then 'PASS' else 'FAIL' end as old_rca_duplicate_removed,
  case when to_regclass('public.uq_rca_analyses_incident') is not null then 'PASS' else 'FAIL' end as rca_used_index_kept,
  case when to_regclass('public.uq_report_submission_version') is null then 'PASS' else 'FAIL' end as report_duplicate_removed,
  case when exists (
    select 1 from pg_constraint
    where conname='report_submissions_reporting_obligation_id_submission_versi_key'
      and conrelid='public.report_submissions'::regclass
      and contype='u'
  ) then 'PASS' else 'FAIL' end as report_unique_constraint_kept;
