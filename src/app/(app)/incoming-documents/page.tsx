import { PageHeader } from "@/components/page-header";
import { IncomingDocumentsClient } from "@/components/incoming-documents-client";
import { hasPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function IncomingDocumentsPage() {
  const { user } = await requireUserContext();
  const canManage = hasPermission(user, "incoming_documents.manage");
  const supabase = await createClient();

  const [departmentsRes, documentsRes, profilesRes] = await Promise.all([
    supabase.from("departments").select("id,name").eq("is_active", true).order("name"),
    supabase
      .from("incoming_documents")
      .select(
        "id,received_at,received_no,document_date,document_no,issuing_authority,summary,document_type,director_note,department_id,deployed_at,due_date,completed_at,completion_note,progress_feedback,file_path,file_name",
      )
      .eq("organization_id", user.organizationId)
      .order("received_at", { ascending: false })
      .limit(300),
    supabase.from("profiles").select("user_id,full_name,email,primary_department_id").eq("organization_id", user.organizationId).eq("is_active", true).order("full_name"),
  ]);

  // "Bút phê GĐ" trước đây là text tự do, không ai ký/ghi thời gian — không
  // thêm cột director_note_by/director_note_at (cần migration) mà đọc lại
  // chính audit_logs đã ghi mỗi lần director_note đổi (INCOMING_DOCUMENT_UPDATE,
  // xem api/incoming-documents/[id]/route.ts) để suy ra ai bút phê lúc nào —
  // 1 nguồn dữ liệu duy nhất, không lưu trùng.
  const documentIds = ((documentsRes.data ?? []) as any[]).map((d) => d.id);
  const directorNoteLogsRes = documentIds.length
    ? await supabase
        .from("audit_logs")
        .select("row_id,actor_user_id,new_value,created_at")
        .eq("table_name", "incoming_documents")
        .eq("action_type", "INCOMING_DOCUMENT_UPDATE")
        .in("row_id", documentIds)
        .order("created_at", { ascending: false })
    : { data: [] as any[], error: null };
  const directorNoteMeta = new Map<string, { actorUserId: string; at: string }>();
  for (const log of (directorNoteLogsRes.data ?? []) as any[]) {
    if (directorNoteMeta.has(log.row_id)) continue;
    if (log.new_value && typeof log.new_value === "object" && "director_note" in log.new_value) {
      directorNoteMeta.set(log.row_id, { actorUserId: log.actor_user_id, at: log.created_at });
    }
  }
  const actorIds = Array.from(new Set(Array.from(directorNoteMeta.values()).map((m) => m.actorUserId).filter(Boolean)));
  const actorsRes = actorIds.length ? await supabase.from("profiles").select("user_id,full_name,email").in("user_id", actorIds) : { data: [] as any[], error: null };
  const actorNameMap = new Map(((actorsRes.data ?? []) as any[]).map((p) => [p.user_id, p.full_name || p.email || p.user_id]));
  const documents = ((documentsRes.data ?? []) as any[]).map((d) => {
    const meta = directorNoteMeta.get(d.id);
    return { ...d, director_note_by: meta ? actorNameMap.get(meta.actorUserId) || null : null, director_note_at: meta ? meta.at : null };
  });

  // "Tạo công việc từ văn bản" (chủ trì + phối hợp) — tải trước toàn bộ công
  // việc của các công văn đang hiển thị trong cùng 1 truy vấn, nhóm lại theo
  // incoming_document_id ở client, tránh N truy vấn khi mở từng dòng.
  const tasksRes = documentIds.length
    ? await supabase
        .from("incoming_document_tasks")
        .select("id,incoming_document_id,title,description,lead_user_id,collaborating_user_ids,due_date,completed_at,created_at")
        .in("incoming_document_id", documentIds)
        .order("created_at", { ascending: false })
    : { data: [] as any[], error: null };

  return (
    <div className="page-stack incoming-documents-page">
      <PageHeader
        title="Công văn đến"
        description="Tiếp nhận công văn, ghi bút phê chỉ đạo, triển khai xuống đơn vị và theo dõi tiến độ hoàn thành theo hạn xử lý."
        icon="list-checks"
      />
      <IncomingDocumentsClient
        departments={(departmentsRes.data ?? []) as any}
        initialDocuments={documents as any}
        profiles={(profilesRes.data ?? []) as any}
        initialTasks={(tasksRes.data ?? []) as any}
        canManage={canManage}
      />
    </div>
  );
}
