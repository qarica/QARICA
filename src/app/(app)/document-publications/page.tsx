import { PageHeader } from "@/components/page-header";
import { DocumentPublicationsClient } from "@/components/document-publications-client";
import { hasPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentPublicationsPage() {
  const { user } = await requireUserContext();
  const canManage = hasPermission(user, "document_publication.manage");
  const supabase = await createClient();

  const [departmentsRes, documentsRes, staffRes, statsRes] = await Promise.all([
    supabase.from("departments").select("id,name").eq("is_active", true).order("name"),
    supabase
      .from("document_publications")
      .select(
        "id,title,document_type,drafting_department_id,requested_by_name,reason,version_label,stage,stage_due_date,current_owner_label,document_code,effective_date,review_date,dissemination_type,file_name,created_at,request_type,target_document_id,retracted_at",
      )
      .order("created_at", { ascending: false })
      .limit(300),
    // "Tự đọc hiểu" xác nhận/theo dõi đã dời sang /procedure-trainings — chỉ
    // còn cần roster nhân sự ở đây để hiện tên người phát hành (staffNameById,
    // cột Lịch sử phiên bản), không còn tính phần bù chưa xác nhận tại trang này.
    supabase.from("profiles").select("user_id,full_name,email").eq("organization_id", user.organizationId).eq("is_active", true).order("full_name"),
    // "Thống kê toàn viện" phải đếm ĐỦ mọi văn bản, không chỉ 300 bản gần
    // nhất mà documentsRes giới hạn cho danh sách làm việc — truy vấn riêng,
    // chỉ lấy 2 cột nhẹ nên đếm được toàn bộ mà không tải lại nội dung đầy đủ.
    supabase.from("document_publications").select("drafting_department_id,document_type").limit(20000),
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
        staffRoster={((staffRes.data ?? []) as any[]).map((p) => ({ id: p.user_id, name: p.full_name || p.email || p.user_id }))}
        initialStatsRows={(statsRes.data ?? []) as any}
        canManage={canManage}
      />
    </div>
  );
}
