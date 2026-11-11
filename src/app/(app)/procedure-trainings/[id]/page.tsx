import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ProcedureTrainingDetailClient } from "@/components/procedure-training-detail-client";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ProcedureTrainingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUserContext();
  requirePermission(user, "procedure_training.view");
  const canManage = hasPermission(user, "procedure_training.manage");
  const { id } = await params;
  const supabase = await createClient();

  const { data: training } = await supabase
    .from("procedure_trainings")
    .select(
      "id,procedure_code,procedure_name,drafting_unit,effective_date,trainer,session_1_time,session_1_location,session_1_method,status,feedback_qlcl,session_2_time,session_2_location,session_2_method,notes,test_score_max",
    )
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .maybeSingle();
  if (!training) notFound();

  const [roundsRes, attendeesRes, questionsRes] = await Promise.all([
    supabase.from("procedure_training_rounds").select("id,round_label,round_date,score_max,sort_order").eq("training_id", id).order("sort_order").order("round_date"),
    supabase.from("procedure_training_attendees").select("id,employee_name,employee_code,department,job_title,attended,attended_at,notes").eq("training_id", id).order("employee_name"),
    supabase.from("procedure_training_questions").select("question_no,correct_answer").eq("training_id", id).order("question_no"),
  ]);
  const attendeeIds = (attendeesRes.data ?? []).map((a) => a.id);

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
        training={training}
        rounds={roundsRes.data ?? []}
        attendees={attendeesRes.data ?? []}
        results={resultRows ?? []}
        responses={responseRows ?? []}
        questions={questionsRes.data ?? []}
        canManage={canManage}
      />
    </div>
  );
}
