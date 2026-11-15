import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Route CÔNG KHAI — không đăng nhập, không requireApiPermission (nhân viên
// quét QR vào thẳng, nhiều người không có tài khoản QARICA). Dùng
// createAdminClient (service role, bỏ qua RLS) như mọi route admin khác
// trong app — KHÔNG lộ correct_answer ra ngoài trong bất kỳ trường hợp nào,
// và chỉ trả câu hỏi khi đợt kiểm tra đang is_open_for_submission = true.
export async function GET(_request: Request, { params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const admin = createAdminClient();

  const { data: round } = await admin
    .from("procedure_training_rounds")
    .select("id,training_id,organization_id,round_label,score_max,is_open_for_submission")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return NextResponse.json({ error: "Không tìm thấy đợt kiểm tra." }, { status: 404 });

  const { data: training } = await admin.from("procedure_trainings").select("procedure_name").eq("id", round.training_id).maybeSingle();
  const trainingName = training?.procedure_name ?? "";

  if (!round.is_open_for_submission) {
    return NextResponse.json({ ok: true, open: false, trainingName, roundLabel: round.round_label });
  }

  // Danh sách khoa/phòng thật để người làm bài CHỌN — phát hiện thực tế từ
  // dữ liệu khảo sát giấy cũ: để tự gõ "Đơn vị công tác" dẫn tới sai chính
  // tả/trùng tên hàng loạt (vd "Khoa Ung Bướu" vs "Khoa ubg bướu", tên bệnh
  // viện viết 3 kiểu khác nhau) — cùng cách đã làm ở /api/public/document-ack.
  const [{ data: questions, error }, { data: departments }] = await Promise.all([
    admin.from("procedure_training_questions").select("question_no,question_text,choices").eq("training_id", round.training_id).order("question_no"),
    admin.from("departments").select("id,name").eq("organization_id", round.organization_id).eq("is_active", true).order("name"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    open: true,
    trainingName,
    roundLabel: round.round_label,
    scoreMax: round.score_max,
    departments: departments ?? [],
    questions: (questions ?? []).map((q) => ({
      question_no: q.question_no,
      question_text: q.question_text || `Câu ${q.question_no}`,
      choices: Array.isArray(q.choices) && q.choices.length > 1 ? q.choices : null,
    })),
  });
}
