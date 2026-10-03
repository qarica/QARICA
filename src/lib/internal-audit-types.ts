// Shared "Audit nội bộ KHTH" engine: one set of tables (hsba_checklist_items,
// hsba_audits, hsba_audit_item_results, hsba_audit_findings), discriminated
// by audit_type, instead of duplicating the checklist/audit/finding shape per
// kind of internal audit (mirrors EMR_CATEGORIES serving emr_rollout_items).
export const INTERNAL_AUDIT_TYPES = ["HSBA", "PHAC_DO_DIEU_TRI", "QTKT_NOI_TRU"] as const;
export type InternalAuditType = (typeof INTERNAL_AUDIT_TYPES)[number];

export const INTERNAL_AUDIT_TYPE_LABEL: Record<InternalAuditType, string> = {
  HSBA: "Hồ sơ bệnh án",
  PHAC_DO_DIEU_TRI: "Phác đồ điều trị",
  QTKT_NOI_TRU: "QTKT nội trú",
};

export function isInternalAuditType(value: unknown): value is InternalAuditType {
  return typeof value === "string" && (INTERNAL_AUDIT_TYPES as readonly string[]).includes(value);
}

export function normalizeInternalAuditType(value: unknown): InternalAuditType {
  return isInternalAuditType(value) ? value : "HSBA";
}
