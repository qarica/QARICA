import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ProcedureTrainingDetailClient } from "@/components/procedure-training-detail-client";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";
import { buildClassOptions, parseDetailTab } from "@/lib/procedure-training-detail-nav";
import { createClient } from "@/lib/supabase/server";

export default async function ProcedureTrainingDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { user } = await requireUserContext();
  requirePermission(user, "procedure_training.view");
  const canManage = hasPermission(user, "procedure_training.manage");
  const { id } = await params;
  // ?tab= giữ nguyên tab đang xem khi đổi sang lớp khác cùng chủ đề (nút chọn lớp ở đầu trang).
  const initialTab = parseDetailTab((await searchParams).tab);
  const supabase = await createClient();

  const { data: training } = await supabase
    .from("procedure_trainings")
    .select(
      "id,procedure_code,procedure_name,drafting_unit,effective_date,trainer,session_1_time,session_1_location,session_1_method,status,feedback_qlcl,notes,test_score_max,pass_threshold,is_open_for_registration,is_attendance_only,is_open_for_attendance,document_publication_id,created_at",
    )
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .maybeSingle();
  if (!training) notFound();

  const [roundsRes, attendeesRes, questionsRes, departmentsRes, registrationsRes] = await Promise.all([
    supabase.from("procedure_training_rounds").select("id,round_label,round_date,score_max,sort_order,is_open_for_submission,shuffle_questions").eq("training_id", id).order("sort_order").order("round_date"),
    supabase.from("procedure_training_attendees").select("id,employee_name,employee_code,department,job_title,attended,attended_at,notes,checked_in_at").eq("training_id", id).order("employee_name"),
    supabase.from("procedure_training_questions").select("question_no,correct_answer,question_text,choices").eq("training_id", id).order("question_no"),
    supabase.from("departments").select("id,name,staff_count").eq("is_active", true).order("name"),
    supabase.from("procedure_training_registrations").select("id,employee_name,employee_code,department,job_title,registered_at,round_id").eq("training_id", id).order("registered_at"),
  ]);
  const attendeeIds = (attendeesRes.data ?? []).map((a) => a.id);

  // "1 chủ đề có nhiều lớp thì nên chọn 1 nút như nút Năm" — các lớp CÙNG CHỦ ĐỀ (cùng quy tắc với
  // màn "Theo chủ đề") để chuyển lớp ngay tại trang, không phải thoát ra danh sách rồi chọn lại.
  const { data: topicCandidates } = await supabase
    .from("procedure_trainings")
    .select("id,procedure_code,procedure_name,document_publication_id,session_1_time,status,created_at")
    .eq("organization_id", user.organizationId)
    .order("created_at", { ascending: true })
    .limit(300);
  const classOptions = buildClassOptions(
    { id: training.id, procedure_code: training.procedure_code, procedure_name: training.procedure_name, document_publication_id: training.document_publication_id, session_1_time: training.session_1_time, status: training.status, created_at: training.created_at },
    topicCandidates ?? [],
  );

  const { data: resultRows } = attendeeIds.length
    ? await supabase.from("procedure_training_results").select("id,attendee_id,round_id,score").in("attendee_id", attendeeIds)
    : { data: [] as { id: string; attendee_id: string; round_id: string; score: number | null }[] };
  const resultIds = (resultRows ?? []).map((r) => r.id);
  const { data: responseRows } = resultIds.length
    ? await supabase.from("procedure_training_responses").select("result_id,question_no,answer_text,is_correct").in("result_id", resultIds).order("question_no")
    : { data: [] as { result_id: string; question_no: number; answer_text: string | null; is_correct: boolean | null }[] };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="PHỔ BIẾN & ĐÀO TẠO"
        title={training.procedure_name}
        description="Nhân sự & điểm theo từng đợt kiểm tra, phân tích theo đối tượng/trước-sau, và cập nhật thông tin đào tạo."
        icon="book-open"
      />
      <ProcedureTrainingDetailClient
        key={training.id}
        initialTab={initialTab}
        classOptions={classOptions}
        training={training}
        rounds={roundsRes.data ?? []}
        attendees={attendeesRes.data ?? []}
        results={resultRows ?? []}
        responses={responseRows ?? []}
        questions={questionsRes.data ?? []}
        departments={departmentsRes.data ?? []}
        registrations={registrationsRes.data ?? []}
        canManage={canManage}
      />
    </div>
  );
}
