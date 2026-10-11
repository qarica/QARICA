import type { UserContext } from "@/lib/types";
import { canViewRecordType } from "@/lib/record-view-permissions";

export type WorkVisibilityRow = {
  source_type: string;
  source_id: string;
  record_id?: string | null;
  organization_id?: string | null;
  owner_user_id?: string | null;
  metadata?: { record_type?: unknown } | null;
};

// Cross-domain projections never grant permission on their own.
export function canViewWorkItem(user: UserContext, row: WorkVisibilityRow): boolean {
  if (row.source_type === "PERSONAL_TASK") {
    return row.owner_user_id === user.id &&
      (row.organization_id == null || row.organization_id === user.organizationId);
  }
  if (!user.organizationId || row.organization_id !== user.organizationId) return false;
  if (row.source_type === "PERSONAL_REMINDER") return row.owner_user_id === user.id;
  if (row.source_type === "ACTION") return !!row.record_id && canViewRecordType(user, "ACTION");
  if (row.source_type === "EMR") return user.permissions.includes("emr.view") || user.permissions.includes("emr.manage");
  if (row.source_type === "RECORD") {
    const recordType = row.metadata?.record_type;
    return !!row.record_id && row.record_id === row.source_id &&
      typeof recordType === "string" && canViewRecordType(user, recordType);
  }
  return false;
}
