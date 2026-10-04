import { HsbaAuditOverviewClient } from "@/components/hsba-audit-overview-client";
import { normalizeInternalAuditType } from "@/lib/internal-audit-types";
import { hasPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function HsbaAuditOverviewPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { user } = await requireUserContext();
  const canManage = hasPermission(user, "hsba_audit.manage");
  const { type } = await searchParams;
  const auditType = normalizeInternalAuditType(type);
  const supabase = await createClient();

  const [departmentsRes, templatesRes, findingsRes] = await Promise.all([
    supabase.from("departments").select("id,name").eq("is_active", true).order("name"),
    supabase
      .from("hsba_checklist_templates")
      .select("id,name,hsba_checklist_versions(id,status,version_no)")
      .eq("organization_id", user.organizationId)
      .eq("audit_type", auditType)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("hsba_audit_findings")
      .select(
        "id,audit_id,department_id,owner_user_id,description,status,sent_at,department_response,department_responded_at,head_decision,head_decided_at,resolved_at,created_at",
      )
      .eq("organization_id", user.organizationId)
      .eq("audit_type", auditType)
      .neq("status", "RESOLVED")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const templates = ((templatesRes.data ?? []) as any[])
    .map((t) => {
      const published = (t.hsba_checklist_versions ?? []).find((v: any) => v.status === "PUBLISHED");
      return published ? { id: t.id, name: t.name, versionId: published.id, versionNo: published.version_no } : null;
    })
    .filter((t): t is { id: string; name: string; versionId: string; versionNo: number } => t !== null);

  return (
    <HsbaAuditOverviewClient
      auditType={auditType}
      departments={(departmentsRes.data ?? []) as any}
      templates={templates}
      initialFindings={(findingsRes.data ?? []) as any}
      canManage={canManage}
    />
  );
}
