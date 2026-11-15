import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmployeeCode } from "@/lib/training-self-test";

// "Nếu cần xem chi tiết từng bài làm từng đáp án nhân viên chọn... vì họ
// thắc mắc" — nhân viên không có tài khoản QARICA nên không đăng nhập lại
// để tra cứu được, chỉ có thể tự nhận diện lại bằng mã NV (như lúc nộp
// bài). KHÔNG yêu cầu round đang mở (is_open_for_submission) — khác với
// GET route chính: người ta thường tra lại SAU khi đợt đã đóng, không phải
// lúc đang làm. Chỉ trả đáp án nhân viên ĐÃ CHỌN + đúng/sai (giống hệt màn
// hình kết quả ngay sau khi nộp) — KHÔNG trả correct_answer, tránh vô tình
// lộ đáp án cho người khác đoán mã NV để xem trước đề của round khác đang
// mở (2 round cùng 1 quy trình dùng chung bộ câu hỏi).
export async function POST(request: Request, { params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const body = await request.json().catch(() => ({}));
  const employeeCodeRaw = String(body.employee_code || "").trim();
  if (!employeeCodeRaw) return NextResponse.json({ error: "Chưa nhập mã nhân viên." }, { status: 400 });

  const admin = createAdminClient();
  const { data: round } = await admin.from("procedure_training_rounds").select("id,training_id,round_label,score_max").eq("id", roundId).maybeSingle();
  if (!round) return NextResponse.json({ error: "Không tìm thấy đợt kiểm tra." }, { status: 404 });

  const normalizedCode = normalizeEmployeeCode(employeeCodeRaw);
  const { data: attendees } = await admin.from("procedure_training_attendees").select("id,employee_name,employee_code").eq("training_id", round.training_id);
  const attendee = (attendees ?? []).find((a) => a.employee_code && normalizeEmployeeCode(a.employee_code) === normalizedCode);
  if (!attendee) return NextResponse.json({ ok: true, found: false });

  const { data: result } = await admin.from("procedure_training_results").select("id,score,created_at").eq("round_id", round.id).eq("attendee_id", attendee.id).maybeSingle();
  if (!result) return NextResponse.json({ ok: true, found: false });

  const [{ data: responses }, { data: questions }] = await Promise.all([
    admin.from("procedure_training_responses").select("question_no,answer_text,is_correct").eq("result_id", result.id).order("question_no"),
    admin.from("procedure_training_questions").select("question_no,question_text").eq("training_id", round.training_id).order("question_no"),
  ]);
  const questionTextByNo = new Map((questions ?? []).map((q) => [q.question_no, q.question_text]));

  return NextResponse.json({
    ok: true,
    found: true,
    employeeName: attendee.employee_name,
    roundLabel: round.round_label,
    score: result.score,
    scoreMax: round.score_max,
    submittedAt: result.created_at,
    total: (responses ?? []).length,
    correctCount: (responses ?? []).filter((r) => r.is_correct).length,
    perQuestion: (responses ?? []).map((r) => ({
      question_no: r.question_no,
      question_text: questionTextByNo.get(r.question_no) || `Câu ${r.question_no}`,
      answer_text: r.answer_text,
      is_correct: r.is_correct,
    })),
  });
}
