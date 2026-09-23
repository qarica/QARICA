-- QARICA performance hygiene: remove only proven duplicate indexes.
-- Keep the canonical/used or constraint-backed index in each pair.

drop index if exists public.uq_indicator_definition_versions_no;
drop index if exists public.uq_rca_analyses_incident_id;
drop index if exists public.uq_report_submission_version;
