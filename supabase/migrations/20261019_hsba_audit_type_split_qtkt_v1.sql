-- Explicit request: "Phác đồ & QTKT nội trú" (one combined audit_type) was
-- too coarse in practice — phác đồ điều trị and QTKT (quy trình kỹ thuật)
-- nội trú are two different checklist contents, each needing its own
-- "Khai báo bảng kiểm" button. Split PHAC_DO_DIEU_TRI's scope down to just
-- "phác đồ điều trị" and add a third audit_type, QTKT_NOI_TRU, alongside it.
-- Existing PHAC_DO_DIEU_TRI rows are left as-is (now read as phác đồ-only);
-- QTKT_NOI_TRU starts empty, same as every other audit_type did at launch.
alter table public.hsba_checklist_items drop constraint if exists hsba_checklist_items_audit_type_check;
alter table public.hsba_checklist_items add constraint hsba_checklist_items_audit_type_check
  check (audit_type in ('HSBA','PHAC_DO_DIEU_TRI','QTKT_NOI_TRU'));

alter table public.hsba_audits drop constraint if exists hsba_audits_audit_type_check;
alter table public.hsba_audits add constraint hsba_audits_audit_type_check
  check (audit_type in ('HSBA','PHAC_DO_DIEU_TRI','QTKT_NOI_TRU'));

alter table public.hsba_audit_findings drop constraint if exists hsba_audit_findings_audit_type_check;
alter table public.hsba_audit_findings add constraint hsba_audit_findings_audit_type_check
  check (audit_type in ('HSBA','PHAC_DO_DIEU_TRI','QTKT_NOI_TRU'));
