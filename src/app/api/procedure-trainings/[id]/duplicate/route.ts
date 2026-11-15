import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS =
  "id,procedure_code,procedure_name,drafting_unit,effective_date,trainer,session_1_time,session_1_location,session_1_method,status,feedback_qlcl,session_2_time,session_2_location,session_2_method,notes,test_score_max,pass_threshold,is_open_for_registration";

// "1 chủ đề đào tạo có thể có nhiều lớp khác nhau, chủ động khai báo thông
// tin lớp và kế thừa thông tin đợt cũ, cho phép sửa lại" — tạo 1 lớp
// (procedure_trainings) MỚI kế thừa thông tin chủ đề/giảng viên/thang điểm
// từ lớp nguồn + sao chép bộ câu hỏi (procedure_training_questions), còn
// thời gian/địa điểm/trạng thái/ghi chú/đợt kiểm tra/nhân sự của lớp mới
// luôn bắt đầu trống — đây là 1 đợt đào tạo khác, không phải mở thêm đợt
// kiểm tra ở lớp cũ (xem CLAUDE.md nguyên tắc 2: không có 2 nguồn sự thật).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("procedure_training.manage");
  if (!auth.ok) return auth.response;
  const { id: sourceId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: source } = await admin
    .from("procedure_trainings")
    .select("procedure_code,procedure_name,drafting_unit,effective_date,trainer,session_1_method,test_score_max,pass_threshold,document_publication_id")
    .eq("id", sourceId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!source) return NextResponse.json({ error: "Không tìm thấy quy trình nguồn." }, { status: 404 });

  const { data: created, error: insertError } = await admin
    .from("procedure_trainings")
    .insert({
      organization_id: organizationId,
      created_by: auth.user.id,
      procedure_code: source.procedure_code,
      procedure_name: source.procedure_name,
      drafting_unit: source.drafting_unit,
      effective_date: source.effective_date,
      document_publication_id: source.document_publication_id,
      trainer: source.trainer,
      session_1_method: source.session_1_method,
      test_score_max: source.test_score_max,
      pass_threshold: source.pass_threshold,
      status: "PLANNED",
    })
    .select(SELECT_COLUMNS)
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

  const { data: sourceQuestions } = await admin
    .from("procedure_training_questions")
    .select("question_no,correct_answer,question_text,choices")
    .eq("training_id", sourceId)
    .eq("organization_id", organizationId);
  if (sourceQuestions?.length) {
    const rows = sourceQuestions.map((q) => ({
      training_id: created.id,
      organization_id: organizationId,
      question_no: q.question_no,
      correct_answer: q.correct_answer,
      question_text: q.question_text,
      choices: q.choices,
    }));
    const { error: questionsError } = await admin.from("procedure_training_questions").insert(rows);
    if (questionsError) return NextResponse.json({ error: questionsError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, training: created });
}
