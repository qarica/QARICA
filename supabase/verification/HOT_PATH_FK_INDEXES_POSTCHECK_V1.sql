-- HOT_PATH_FK_INDEXES_POSTCHECK_V1
select
  case when to_regclass('public.idx_actions_record_id') is not null then 'PASS' else 'FAIL' end as actions_record,
  case when to_regclass('public.idx_evidence_links_record_id') is not null then 'PASS' else 'FAIL' end as evidence_record,
  case when to_regclass('public.idx_evidence_links_evidence_id') is not null then 'PASS' else 'FAIL' end as evidence_id,
  case when to_regclass('public.idx_audit_logs_record_id') is not null then 'PASS' else 'FAIL' end as audit_record;
