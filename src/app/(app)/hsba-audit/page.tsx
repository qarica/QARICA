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

  // "Nhân viên phụ trách" trong dropdown chỉ liệt kê nhân sự ĐANG hoạt động
  // của đúng khoa (xem department-staff/route.ts) — nếu người đã gán trước đó
  // đã ngưng hoạt động hoặc đổi khoa/phòng, dropdown sẽ không có option khớp
  // giá trị owner_user_id hiện tại, hiện ra như "chưa gán" dù DB vẫn lưu đúng.
  // Resolve tên người đã gán KHÔNG lọc is_active để client luôn hiện đúng,
  // tương tự quy ước "groupOptions" đã dùng cho Nhóm gáy (luôn giữ giá trị
  // hiện tại trong danh sách dù không còn đạt điều kiện chọn mới).
  const ownerIds = Array.from(new Set(((findingsRes.data ?? []) as any[]).map((f) => f.owner_user_id).filter(Boolean)));
  const ownersRes = ownerIds.length ? await supabase.from("profiles").select("user_id,full_name,email").in("user_id", ownerIds) : { data: [] as any[] };
  const ownerName = new Map((ownersRes.data ?? []).map((p: any) => [p.user_id, p.full_name || p.email || p.user_id]));
  const findingsWithOwnerName = ((findingsRes.data ?? []) as any[]).map((f) => ({ ...f, owner_name: f.owner_user_id ? ownerName.get(f.owner_user_id) || null : null }));

  return (
    <HsbaAuditOverviewClient
      auditType={auditType}
      departments={(departmentsRes.data ?? []) as any}
      templates={templates}
      initialFindings={findingsWithOwnerName as any}
      canManage={canManage}
    />
  );
}
