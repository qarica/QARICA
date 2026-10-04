import { hasAnyPermission } from "@/lib/auth";
import type { UserContext } from "@/lib/types";

// Nguồn sự thật duy nhất cho "quyền nào được xem loại hồ sơ nào" — khớp
// chính xác danh sách permissions mỗi trang module tự đòi hỏi (vd
// src/app/(app)/risks/page.tsx đòi risk.view/risk.manage). Dùng ở bất kỳ màn
// hình tổng hợp liên-module nào (Trợ lý QLCL, Hồ sơ đã hủy, Dashboard...) để
// không lộ nội dung của module mà người xem không có quyền riêng, dù màn
// hình đó chỉ đòi một quyền tổng hợp rộng hơn (vd dashboard.view).
export const RECORD_VIEW_PERMISSIONS: Record<string, string[]> = {
  ACTION: ["tasks.view"],
  PROGRAM: ["plans.view", "plans.manage"],
  DIRECTIVE: ["directives.view", "directives.manage"],
  REPORT: ["reports.view", "reports.manage"],
  INSPECTION: ["inspections.view", "inspections.manage"],
  INDICATOR_MEASUREMENT: ["indicators.view", "indicators.manage", "indicators.enter", "indicators.verify"],
  MONITORING: ["monitoring.view", "monitoring.perform", "checklists.view", "checklists.manage"],
  FINDING: ["findings.view", "findings.manage"],
  INCIDENT: ["incident.report", "incident.view_summary", "incident.view_case", "incident.triage"],
  CAPA: ["capa.view", "capa.manage"],
  RISK: ["risk.view", "risk.manage"],
  FMEA: ["risk.view", "risk.manage"],
  IMPROVEMENT_PROJECT: ["projects.view", "projects.propose", "projects.manage"],
  IMPROVEMENT_PROPOSAL: ["projects.view", "projects.propose", "projects.manage"],
  ASSESSMENT: ["criteria.view", "criteria.assess", "criteria.review", "criteria.manage"],
  EXTERNAL_ASSESSMENT: ["criteria.view", "criteria.review", "criteria.manage"],
  AUDIT: ["audit.view", "audit.perform", "audit.manage"],
  SAFETY_ALERT: ["safety_alert.view", "safety_alert.edit", "safety_alert.publish"],
  FEEDBACK: ["feedback.view", "feedback.manage"],
};

export function canViewRecordType(user: UserContext, recordType: string): boolean {
  const codes = RECORD_VIEW_PERMISSIONS[recordType];
  if (!codes) return false;
  return hasAnyPermission(user, codes);
}
