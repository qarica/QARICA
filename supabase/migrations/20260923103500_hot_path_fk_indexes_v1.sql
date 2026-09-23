-- QARICA hot-path FK indexes V1.
-- Scoped to high-frequency record/action/evidence/audit lookups used across workflows.
create index if not exists idx_actions_record_id on public.actions(record_id);
create index if not exists idx_evidence_links_record_id on public.evidence_links(record_id);
create index if not exists idx_evidence_links_evidence_id on public.evidence_links(evidence_id);
create index if not exists idx_audit_logs_record_id on public.audit_logs(record_id);
