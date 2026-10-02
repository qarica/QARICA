import { PageHeader } from "@/components/page-header";
import { IncomingDocumentsClient } from "@/components/incoming-documents-client";
import { hasPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function IncomingDocumentsPage() {
  const { user } = await requireUserContext();
  const canManage = hasPermission(user, "incoming_documents.manage");
  const supabase = await createClient();

  const [departmentsRes, documentsRes] = await Promise.all([
    supabase.from("departments").select("id,name").eq("organization_id", user.organizationId).eq("is_active", true).order("name"),
    supabase
      .from("incoming_documents")
      .select(
        "id,received_at,received_no,document_date,document_no,issuing_authority,summary,document_type,director_note,department_id,deployed_at,due_date,completed_at,completion_note,progress_feedback",
      )
      .eq("organization_id", user.organizationId)
      .order("received_at", { ascending: false })
      .limit(300),
  ]);

  return (
    <div className="page-stack incoming-documents-page">
      <PageHeader
        eyebrow="Điều hành chất lượng"
        title="Công văn đến"
        description="Tiếp nhận công văn, ghi bút phê chỉ đạo, triển khai xuống đơn vị và theo dõi tiến độ hoàn thành theo hạn xử lý."
        icon="list-checks"
      />
      <IncomingDocumentsClient
        departments={(departmentsRes.data ?? []) as any}
        initialDocuments={(documentsRes.data ?? []) as any}
        canManage={canManage}
      />
    </div>
  );
}
