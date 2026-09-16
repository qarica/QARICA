import { actionCreatePermissions } from "./source-action-policy";

export const RECORD_DEPARTMENT_ROLES = ["RELATED", "COORDINATING", "CONSULTED", "INFORMED"] as const;
export type RecordDepartmentRole = typeof RECORD_DEPARTMENT_ROLES[number];

export const RECORD_DEPARTMENT_ROLE_LABELS: Record<RecordDepartmentRole, string> = {
  RELATED: "Đơn vị liên quan",
  COORDINATING: "Đơn vị phối hợp",
  CONSULTED: "Đơn vị tham vấn",
  INFORMED: "Đơn vị nhận thông tin",
};

export function isRecordDepartmentRole(value: string): value is RecordDepartmentRole {
  return RECORD_DEPARTMENT_ROLES.includes(value as RecordDepartmentRole);
}

export function recordDepartmentManagePermissions(recordType: string) {
  return actionCreatePermissions(recordType);
}

export function canManageRecordDepartments(userPermissions: string[], recordType: string) {
  const allowed = new Set(userPermissions);
  return recordDepartmentManagePermissions(recordType).some((permission) => allowed.has(permission));
}
