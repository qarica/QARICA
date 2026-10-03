-- Generalize the HSBA-only module into a shared "Audit nội bộ KHTH" engine:
-- same 4 tables, discriminated by audit_type, instead of duplicating the
-- checklist/audit/finding shape for each new internal-audit kind (mirrors how
-- emr_rollout_items serves 8 categories off one shared table, per that
-- migration's own "shared engine, not one module per item" comment).
alter table public.hsba_checklist_items add column if not exists audit_type text not null default 'HSBA'
  check (audit_type in ('HSBA','PHAC_DO_DIEU_TRI'));
alter table public.hsba_audits add column if not exists audit_type text not null default 'HSBA'
  check (audit_type in ('HSBA','PHAC_DO_DIEU_TRI'));
alter table public.hsba_audit_findings add column if not exists audit_type text not null default 'HSBA'
  check (audit_type in ('HSBA','PHAC_DO_DIEU_TRI'));

create index if not exists hsba_checklist_items_org_type_idx
  on public.hsba_checklist_items(organization_id, audit_type, is_active, sort_order);
create index if not exists hsba_audits_org_type_period_idx
  on public.hsba_audits(organization_id, audit_type, period, department_id);
create index if not exists hsba_audit_findings_org_type_status_idx
  on public.hsba_audit_findings(organization_id, audit_type, status);
