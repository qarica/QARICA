import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// "Muốn xem 1 người thì làm sao tra cứu bao nhiêu điểm, sai câu nào đúng câu
// nào" — 1 người có thể có kết quả ở nhiều đợt kiểm tra (round); mỗi kết quả
// có thể có chi tiết đúng/sai từng câu (khi nhập từ file khảo sát thô có đáp
// án). Gắn thêm question_text/correct_answer từ procedure_training_questions
// để hiện được "câu X: ... — sai, bạn chọn A, đáp án đúng B".
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attendeeId: string }> }) {
  const auth = await requireApiPermission("procedure_training.view");
  if (!auth.ok) return auth.response;
  const { id: trainingId, attendeeId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: attendee } = await admin.from("procedure_training_attendees").select("id").eq("id", attendeeId).eq("training_id", trainingId).eq("organization_id", organizationId).maybeSingle();
  if (!attendee) return NextResponse.json({ error: "Không tìm thấy nhân sự." }, { status: 404 });

  const { data: resultRows, error } = await admin
    .from("procedure_training_results")
    .select("id,score,procedure_training_rounds(id,round_label,round_date,score_max)")
    .eq("attendee_id", attendeeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const resultIds = (resultRows ?? []).map((r) => r.id);
  const { data: responseRows } = resultIds.length
    ? await admin.from("procedure_training_responses").select("result_id,question_no,answer_text,is_correct").in("result_id", resultIds).order("question_no")
    : { data: [] as { result_id: string; question_no: number; answer_text: string | null; is_correct: boolean | null }[] };

  const { data: questionRows } = await admin.from("procedure_training_questions").select("question_no,correct_answer").eq("training_id", trainingId);
  const answerByQuestion = new Map((questionRows ?? []).map((q) => [q.question_no, q.correct_answer]));

  const responsesByResult = new Map<string, { question_no: number; answer_text: string | null; is_correct: boolean | null; correct_answer: string | null }[]>();
  for (const r of responseRows ?? []) {
    const list = responsesByResult.get(r.result_id) || [];
    list.push({ question_no: r.question_no, answer_text: r.answer_text, is_correct: r.is_correct, correct_answer: answerByQuestion.get(r.question_no) ?? null });
    responsesByResult.set(r.result_id, list);
  }

  const results = ((resultRows ?? []) as unknown as { id: string; score: number | null; procedure_training_rounds: { id: string; round_label: string; round_date: string | null; score_max: number | null } | null }[])
    .filter((r) => r.procedure_training_rounds)
    .map((r) => ({
      id: r.id,
      score: r.score,
      round_id: r.procedure_training_rounds!.id,
      round_label: r.procedure_training_rounds!.round_label,
      round_date: r.procedure_training_rounds!.round_date,
      score_max: r.procedure_training_rounds!.score_max,
      responses: responsesByResult.get(r.id) || [],
    }));

  return NextResponse.json({ ok: true, results });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; attendeeId: string }> }) {
  const auth = await requireApiPermission("procedure_training.manage");
  if (!auth.ok) return auth.response;
  const { id: trainingId, attendeeId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: attendee } = await admin.from("procedure_training_attendees").select("id").eq("id", attendeeId).eq("training_id", trainingId).eq("organization_id", organizationId).maybeSingle();
  if (!attendee) return NextResponse.json({ error: "Không tìm thấy nhân sự." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const roundId = String(body.round_id || "");
  if (!roundId) return NextResponse.json({ error: "Chưa chọn đợt kiểm tra." }, { status: 400 });
  const { data: round } = await admin.from("procedure_training_rounds").select("id").eq("id", roundId).eq("training_id", trainingId).eq("organization_id", organizationId).maybeSingle();
  if (!round) return NextResponse.json({ error: "Không tìm thấy đợt kiểm tra." }, { status: 404 });

  let score: number | null = null;
  if (body.score !== undefined && body.score !== null && body.score !== "") {
    const parsed = Number(body.score);
    if (!Number.isFinite(parsed) || parsed < 0) return NextResponse.json({ error: "Điểm không hợp lệ." }, { status: 400 });
    score = parsed;
  }

  const { data: result, error } = await admin
    .from("procedure_training_results")
    .upsert({ round_id: roundId, attendee_id: attendeeId, organization_id: organizationId, score, updated_at: new Date().toISOString() }, { onConflict: "round_id,attendee_id" })
    .select("id,score")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (Array.isArray(body.responses)) {
    await admin.from("procedure_training_responses").delete().eq("result_id", result.id);
    const rows = body.responses
      .map((r: { question_no?: unknown; answer_text?: unknown; is_correct?: unknown }) => ({
        result_id: result.id,
        organization_id: organizationId,
        question_no: Number(r.question_no),
        answer_text: r.answer_text != null ? String(r.answer_text) : null,
        is_correct: typeof r.is_correct === "boolean" ? r.is_correct : null,
      }))
      .filter((r: { question_no: number }) => Number.isFinite(r.question_no) && r.question_no > 0);
    if (rows.length) {
      const { error: responsesError } = await admin.from("procedure_training_responses").insert(rows);
      if (responsesError) return NextResponse.json({ error: responsesError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, result });
}
