import { PageHeader } from "@/components/page-header";
import { DocumentPublicationsClient } from "@/components/document-publications-client";
import { hasPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentPublicationsPage() {
  const { user } = await requireUserContext();
  const canManage = hasPermission(user, "document_publication.manage");
  const supabase = await createClient();

  const [departmentsRes, documentsRes, acknowledgmentsRes, staffRes] = await Promise.all([
    supabase.from("departments").select("id,name").eq("is_active", true).order("name"),
    supabase
      .from("document_publications")
      .select(
        "id,title,document_type,drafting_department_id,requested_by_name,reason,version_label,stage,stage_due_date,current_owner_label,document_code,effective_date,review_date,dissemination_type,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("document_publication_acknowledgments").select("document_publication_id,user_id").limit(5000),
    // Trước đây "Tự đọc hiểu" chỉ hiện số lượng đã xác nhận, không biết AI
    // chưa xác nhận để nhắc — cần toàn bộ nhân sự đang hoạt động của tổ chức
    // để tính phần bù (chưa xác nhận = toàn bộ - đã xác nhận).
    supabase.from("profiles").select("user_id,full_name,email").eq("organization_id", user.organizationId).eq("is_active", true).order("full_name"),
  ]);

  return (
    <div className="page-stack document-publications-page">
      <PageHeader
        title="Kiểm soát tài liệu"
        description="Theo dõi vòng đời văn bản từ đề nghị, soạn thảo, góp ý, rà soát, phê duyệt đến phát hành chính thức."
        icon="file-text"
      />
      <DocumentPublicationsClient
        departments={(departmentsRes.data ?? []) as any}
        initialDocuments={(documentsRes.data ?? []) as any}
        acknowledgments={(acknowledgmentsRes.data ?? []) as any}
        staffRoster={((staffRes.data ?? []) as any[]).map((p) => ({ id: p.user_id, name: p.full_name || p.email || p.user_id }))}
        currentUserId={user.id}
        canManage={canManage}
      />
    </div>
  );
}
