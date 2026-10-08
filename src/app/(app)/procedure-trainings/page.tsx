import { PageHeader } from "@/components/page-header";
import { ProcedureTrainingsClient } from "@/components/procedure-trainings-client";
import { hasPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ProcedureTrainingsPage() {
  const { user } = await requireUserContext();
  const canManage = hasPermission(user, "procedure_training.manage");
  const supabase = await createClient();

  const { data } = await supabase
    .from("procedure_trainings")
    .select(
      "id,procedure_code,procedure_name,drafting_unit,effective_date,trainer,session_1_time,session_1_location,session_1_method,status,feedback_qlcl,session_2_time,session_2_location,session_2_method,notes,document_publication_id",
    )
    .eq("organization_id", user.organizationId)
    .order("created_at", { ascending: false })
    .limit(300);

  // Nhiệm vụ đào tạo tự tạo khi phát hành văn bản (dissemination_type =
  // TRAINING_REQUIRED, xem document-publications/[id]/route.ts) chỉ lưu
  // document_publication_id — trước đây màn hình này còn chưa đọc/hiện cột
  // đó nên không ai biết 1 dòng Đào tạo đến từ văn bản nào. document-
  // publications chưa có trang chi tiết theo id nên chỉ liên kết về trang
  // danh sách, không phải 1 dòng cụ thể.
  const sourceDocIds = Array.from(new Set((data ?? []).map((t) => t.document_publication_id).filter((id): id is string => !!id)));
  const { data: sourceDocs } = sourceDocIds.length
    ? await supabase.from("document_publications").select("id,title,document_code").in("id", sourceDocIds)
    : { data: [] as { id: string; title: string; document_code: string | null }[] };
  const sourceDocMap = new Map((sourceDocs ?? []).map((d) => [d.id, d]));

  // Tỷ lệ hoàn thành (đã đào tạo / tổng số nhân sự đăng ký) — cùng cách tính
  // tổng hợp 1 query như /api/procedure-trainings, không N+1 theo từng dòng.
  const trainingIds = (data ?? []).map((t) => t.id);
  const { data: attendeeRows } = trainingIds.length
    ? await supabase.from("procedure_training_attendees").select("training_id,attended").in("training_id", trainingIds)
    : { data: [] as { training_id: string; attended: boolean }[] };
  const counts = new Map<string, { total: number; attended: number }>();
  for (const row of attendeeRows ?? []) {
    const current = counts.get(row.training_id) || { total: 0, attended: 0 };
    current.total += 1;
    if (row.attended) current.attended += 1;
    counts.set(row.training_id, current);
  }
  const trainings = (data ?? []).map((t) => ({
    ...t,
    attendee_total: counts.get(t.id)?.total || 0,
    attendee_attended: counts.get(t.id)?.attended || 0,
    source_document: t.document_publication_id ? sourceDocMap.get(t.document_publication_id) || null : null,
  }));

  return (
    <div className="page-stack procedure-trainings-page">
      <PageHeader
        title="Theo dõi quy trình đào tạo"
        description="Theo dõi việc phổ biến/đào tạo quy trình, biểu mẫu mới ban hành cho các đơn vị — đào tạo lần 1 và lần 2 nếu cần đào tạo lại."
        icon="list-checks"
      />
      <ProcedureTrainingsClient initialTrainings={trainings as any} canManage={canManage} />
    </div>
  );
}
