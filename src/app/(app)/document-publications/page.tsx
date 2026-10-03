import { PageHeader } from "@/components/page-header";
import { DocumentPublicationsClient } from "@/components/document-publications-client";
import { hasPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentPublicationsPage() {
  const { user } = await requireUserContext();
  const canManage = hasPermission(user, "document_publication.manage");
  const supabase = await createClient();

  const [departmentsRes, documentsRes] = await Promise.all([
    supabase.from("departments").select("id,name").eq("is_active", true).order("name"),
    supabase
      .from("document_publications")
      .select(
        "id,title,document_type,drafting_department_id,requested_by_name,reason,version_label,stage,stage_due_date,current_owner_label,document_code,effective_date,review_date,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  return (
    <div className="page-stack document-publications-page">
      <PageHeader
        title="Phát hành văn bản"
        description="Theo dõi vòng đời văn bản từ đề nghị, soạn thảo, góp ý, rà soát, phê duyệt đến phát hành chính thức."
        icon="file-text"
      />
      <DocumentPublicationsClient
        departments={(departmentsRes.data ?? []) as any}
        initialDocuments={(documentsRes.data ?? []) as any}
        canManage={canManage}
      />
    </div>
  );
}
