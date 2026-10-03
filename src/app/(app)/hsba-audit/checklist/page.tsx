import { HsbaChecklistClient } from "@/components/hsba-checklist-client";
import { normalizeInternalAuditType } from "@/lib/internal-audit-types";
import { hasPermission, requireUserContext } from "@/lib/auth";

export default async function HsbaChecklistPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { user } = await requireUserContext();
  const { type } = await searchParams;
  return <HsbaChecklistClient auditType={normalizeInternalAuditType(type)} canManage={hasPermission(user, "hsba_audit.manage")} />;
}
