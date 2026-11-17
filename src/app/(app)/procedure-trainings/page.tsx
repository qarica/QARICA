import { PageHeader } from "@/components/page-header";
import { ProcedureTrainingsClient } from "@/components/procedure-trainings-client";
import { hasPermission, requireUserContext } from "@/lib/auth";
import { buildTopicCompletion, groupTrainingsByTopic } from "@/lib/procedure-training-topic-rollup";
import { normalizeEmployeeCode } from "@/lib/training-self-test";
import { createClient } from "@/lib/supabase/server";

export default async function ProcedureTrainingsPage() {
  const { user } = await requireUserContext();
  const canManage = hasPermission(user, "procedure_training.manage");
  const canManageDocuments = hasPermission(user, "document_publication.manage");
  const supabase = await createClient();

  const { data } = await supabase
    .from("procedure_trainings")
    .select(
      "id,procedure_code,procedure_name,drafting_unit,effective_date,trainer,session_1_time,session_1_location,session_1_method,status,feedback_qlcl,session_2_time,session_2_location,session_2_method,notes,document_publication_id,test_score_max,pass_threshold",
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

  // "1 chủ đề đào tạo có thể mở nhiều lớp nhiều đợt vào nhiều ngày khác
  // nhau... chỉ tổng hợp kết quả nhân viên hoàn thành bài đào tạo nhưng chỉ
  // khác ngày hoàn thành" — tab "Theo chủ đề" gộp các đợt đào tạo cùng chủ
  // đề (groupTrainingsByTopic — ưu tiên document_publication_id, fallback
  // procedure_name chuẩn hoá) và tính Đạt/Không đạt gộp theo mã NV qua các
  // đợt (buildTopicCompletion, dùng chung computePassStatus — không tính
  // lại logic lần 2).
  const { data: fullAttendeeRows } = trainingIds.length
    ? await supabase.from("procedure_training_attendees").select("id,training_id,employee_code,employee_name,department,job_title,attended").in("training_id", trainingIds)
    : { data: [] as { id: string; training_id: string; employee_code: string | null; employee_name: string; department: string | null; job_title: string | null; attended: boolean }[] };
  const attendeeIds = (fullAttendeeRows ?? []).map((a) => a.id);
  const attendeeIdByTrainingAndCode = new Map<string, string>();
  for (const a of fullAttendeeRows ?? []) {
    if (a.employee_code) attendeeIdByTrainingAndCode.set(`${a.training_id}:${normalizeEmployeeCode(a.employee_code)}`, a.id);
  }
  const { data: roundRows } = trainingIds.length
    ? await supabase.from("procedure_training_rounds").select("id,training_id,sort_order,round_date").in("training_id", trainingIds)
    : { data: [] as { id: string; training_id: string; sort_order: number; round_date: string | null }[] };
  const roundsByTraining = new Map<string, { id: string; sort_order: number; round_date: string | null }[]>();
  for (const r of roundRows ?? []) roundsByTraining.set(r.training_id, [...(roundsByTraining.get(r.training_id) || []), { id: r.id, sort_order: r.sort_order, round_date: r.round_date }]);
  const { data: resultRows } = attendeeIds.length
    ? await supabase.from("procedure_training_results").select("attendee_id,round_id,score").in("attendee_id", attendeeIds)
    : { data: [] as { attendee_id: string; round_id: string; score: number | null }[] };
  const resultsByAttendeeId = new Map<string, { round_id: string; score: number | null }[]>();
  for (const r of resultRows ?? []) resultsByAttendeeId.set(r.attendee_id, [...(resultsByAttendeeId.get(r.attendee_id) || []), { round_id: r.round_id, score: r.score }]);

  const topicGroups = Array.from(groupTrainingsByTopic(trainings).entries()).map(([key, groupTrainings]) => ({
    key,
    trainings: groupTrainings.map((t) => ({ id: t.id, procedure_name: t.procedure_name, effective_date: t.effective_date })),
    rollup: buildTopicCompletion(
      groupTrainings,
      (fullAttendeeRows ?? []).filter((a) => groupTrainings.some((t) => t.id === a.training_id)),
      roundsByTraining,
      resultsByAttendeeId,
      attendeeIdByTrainingAndCode,
    ),
  }));

  // Báo cáo thực tế: "Phần theo dõi quy trình đào tạo chưa thấy kết nối với
  // kiểm soát tài liệu... nên làm menu theo dõi gồm cả 2 nội dung [Tự đọc
  // hiểu + Cần đào tạo] để control chứ ko đưa phần xác nhận vào thư viện văn
  // bản" — trang này giờ còn theo dõi "Tự đọc hiểu" (tab riêng), dữ liệu lấy
  // từ document_publications (dissemination_type=SELF_READ, PUBLISHED, request_
  // type NEW). Báo cáo thực tế tiếp theo: "Tài liệu tự đọc hiểu không nên
  // xác nhận bên trong QARICA mà chỉ xác nhận bằng QR hoặc link" — đã bỏ hẳn
  // route xác nhận trong app (/api/document-publications/[id]/acknowledge),
  // CHỈ còn xác nhận qua /xac-nhan-doc-hieu/[id] (công khai, không đăng
  // nhập). Dữ liệu acks cũ có user_id (từ cơ chế cũ) vẫn giữ nguyên, không
  // xoá, chỉ không còn đường ghi mới qua app nữa.
  const { data: selfReadData } = await supabase
    .from("document_publications")
    .select("id,title,document_code,version_label,effective_date")
    .eq("stage", "PUBLISHED")
    .eq("request_type", "NEW")
    .eq("dissemination_type", "SELF_READ")
    .order("effective_date", { ascending: false })
    .limit(300);
  const selfReadDocs = selfReadData ?? [];
  const selfReadIds = selfReadDocs.map((d) => d.id);
  const { data: acknowledgmentsData } = selfReadIds.length
    ? await supabase.from("document_publication_acknowledgments").select("document_publication_id,user_id,department_id").in("document_publication_id", selfReadIds)
    : { data: [] as { document_publication_id: string; user_id: string | null; department_id: string | null }[] };
  // Báo cáo thực tế: "bên loại tự đọc hiểu cũng chưa có dashboard thống kê
  // giám sát" — vì xác nhận giờ ẩn danh qua QR (không có tài khoản QARICA để
  // so khớp từng người), tính tuân thủ theo CÙNG quy ước đã dùng ở module
  // đào tạo: số nhân viên khai báo theo khoa/phòng (departments.staff_count)
  // làm mẫu số, không suy ra danh sách "chưa xác nhận" theo từng người.
  const { data: departmentsData } = await supabase.from("departments").select("id,name,staff_count").eq("organization_id", user.organizationId).eq("is_active", true).order("name");

  return (
    <div className="page-stack procedure-trainings-page">
      <PageHeader
        title="Theo dõi phổ biến & đào tạo"
        description="Theo dõi việc phổ biến tài liệu sau khi phát hành — Tự đọc hiểu (từng nhân viên tự xác nhận) và Cần đào tạo (đào tạo lần 1, lần 2 nếu cần)."
        icon="list-checks"
      />
      <ProcedureTrainingsClient
        initialTrainings={trainings as any}
        canManage={canManage}
        selfReadDocuments={selfReadDocs as any}
        acknowledgments={(acknowledgmentsData ?? []) as any}
        departments={(departmentsData ?? []) as any}
        canManageDocuments={canManageDocuments}
        topicGroups={topicGroups as any}
      />
    </div>
  );
}
