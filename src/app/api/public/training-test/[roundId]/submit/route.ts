import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeScore, gradeAnswers, normalizeEmployeeCode, type SubmittedAnswer } from "@/lib/training-self-test";
import { namesMatch } from "@/lib/training-import";

// Route CÔNG KHAI — nộp bài không đăng nhập. Chống nộp trùng: so khớp mã NV
// đã chuẩn hoá trước, không tìm được qua mã thì fallback so khớp họ tên bằng
// namesMatch (xem matchedAttendee bên dưới) với attendee đã có của CÙNG
// training_id — nếu người đó đã có kết quả cho round_id này rồi thì chặn
// (chính sách đã chốt: làm 1 lần duy nhất). Mã nhân viên không bắt buộc.
// Không dùng RLS cho anon — toàn bộ kiểm tra nằm ở đây, qua service role
// (createAdminClient), giống mọi route admin khác trong app.
export async function POST(request: Request, { params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const body = await request.json().catch(() => ({}));

  const employeeName = String(body.employee_name || "").trim();
  const employeeCodeRaw = String(body.employee_code || "").trim();
  const departmentId = String(body.department_id || "").trim();
  const jobTitle = String(body.job_title || "").trim();
  const answers: SubmittedAnswer[] = Array.isArray(body.answers)
    ? body.answers
        .map((a: unknown) => {
          const entry = a as { question_no?: unknown; answer_text?: unknown };
          const questionNo = Number(entry?.question_no);
          return Number.isFinite(questionNo) ? { question_no: questionNo, answer_text: String(entry?.answer_text ?? "").trim() } : null;
        })
        .filter((a: SubmittedAnswer | null): a is SubmittedAnswer => a !== null)
    : [];

  if (!employeeName) return NextResponse.json({ error: "Chưa nhập họ tên." }, { status: 400 });
  if (!departmentId) return NextResponse.json({ error: "Chưa chọn đơn vị công tác." }, { status: 400 });
  if (!jobTitle) return NextResponse.json({ error: "Chưa chọn chức danh chuyên môn." }, { status: 400 });
  if (!answers.length) return NextResponse.json({ error: "Chưa trả lời câu nào." }, { status: 400 });

  const admin = createAdminClient();

  const { data: round } = await admin
    .from("procedure_training_rounds")
    .select("id,training_id,organization_id,score_max,is_open_for_submission")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return NextResponse.json({ error: "Không tìm thấy đợt kiểm tra." }, { status: 404 });
  if (!round.is_open_for_submission) return NextResponse.json({ error: "Đợt kiểm tra hiện chưa mở để làm bài." }, { status: 403 });

  // department_id do client gửi lên — xác minh thuộc đúng tổ chức của đợt
  // này trước khi dùng, không tin dữ liệu client (route công khai). Lưu tên
  // khoa/phòng (không phải id) vào procedure_training_attendees.department
  // (cột text có sẵn, dùng chung với dữ liệu nhập tay của admin) — chọn từ
  // danh sách thật thay vì tự gõ để tránh sai chính tả/trùng tên (phát hiện
  // từ dữ liệu khảo sát giấy cũ: "Khoa Ung Bướu" vs "Khoa ubg bướu"...).
  const { data: department } = await admin.from("departments").select("id,name").eq("id", departmentId).eq("organization_id", round.organization_id).maybeSingle();
  if (!department) return NextResponse.json({ error: "Đơn vị công tác không hợp lệ." }, { status: 400 });

  const { data: questions } = await admin
    .from("procedure_training_questions")
    .select("question_no,correct_answer,question_text,choices")
    .eq("training_id", round.training_id)
    .order("question_no");
  if (!questions || !questions.length) return NextResponse.json({ error: "Đợt đào tạo này chưa có câu hỏi." }, { status: 400 });
  const questionByNo = new Map(questions.map((q) => [q.question_no, q]));

  // Báo cáo thực tế: "cùng 1 người nhưng tách 2 dòng dẫn đến 1 dòng đạt 1
  // dòng học lại" — sau khi bỏ bắt buộc mã NV, 2 lần nộp (Pre-test + Post-
  // test) của CÙNG 1 người bị tạo thành 2 attendee riêng khi không so khớp
  // được gì, mỗi dòng chỉ có điểm 1 đợt nên tính đạt/không đạt sai lệch
  // nhau. Phát hiện thêm từ dữ liệu thật: người gõ mã NV 1 lần ("NV 22035")
  // rồi lần sau chỉ gõ số ("22035") — 2 mã khác định dạng không so khớp
  // bằng normalizeEmployeeCode được; và người gõ tên có dấu 1 lần, không
  // dấu lần khác ("Khuong thị Thanh" vs "KHUONG THI THANH"). Nên: thử so
  // khớp theo mã trước (nếu có mã); nếu KHÔNG tìm được qua mã (không có mã,
  // hoặc mã không khớp định dạng) thì fallback so khớp theo họ tên — dùng
  // namesMatch (bỏ dấu + viết thường + bỏ chức danh viết tắt) của
  // training-import.ts, mạnh hơn so sánh chuỗi thường vì xử lý được cả lệch
  // dấu tiếng Việt, không chỉ lệch hoa/thường.
  const normalizedCode = employeeCodeRaw ? normalizeEmployeeCode(employeeCodeRaw) : null;
  const { data: existingAttendees } = await admin.from("procedure_training_attendees").select("id,employee_code,employee_name").eq("training_id", round.training_id);
  const matchedByCode = normalizedCode ? (existingAttendees ?? []).find((a) => a.employee_code && normalizeEmployeeCode(a.employee_code) === normalizedCode) : undefined;
  const matchedAttendee = matchedByCode ?? (existingAttendees ?? []).find((a) => namesMatch(a.employee_name, employeeName));

  let attendeeId: string;
  if (matchedAttendee) {
    attendeeId = matchedAttendee.id;
    const { data: existingResult } = await admin
      .from("procedure_training_results")
      .select("id")
      .eq("round_id", round.id)
      .eq("attendee_id", attendeeId)
      .maybeSingle();
    if (existingResult) return NextResponse.json({ error: "Mã nhân viên này đã nộp bài cho đợt kiểm tra này rồi." }, { status: 409 });
    await admin.from("procedure_training_attendees").update({ attended: true, attended_at: new Date().toISOString().slice(0, 10) }).eq("id", attendeeId);
  } else {
    const { data: newAttendee, error: attendeeError } = await admin
      .from("procedure_training_attendees")
      .insert({
        training_id: round.training_id,
        organization_id: round.organization_id,
        employee_name: employeeName,
        employee_code: employeeCodeRaw || null,
        department: department.name,
        job_title: jobTitle,
        attended: true,
        attended_at: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (attendeeError || !newAttendee) return NextResponse.json({ error: attendeeError?.message || "Không tạo được hồ sơ người làm bài." }, { status: 400 });
    attendeeId = newAttendee.id;
  }

  const graded = gradeAnswers(questions, answers);
  const score = computeScore(graded, round.score_max);

  const { data: result, error: resultError } = await admin
    .from("procedure_training_results")
    .insert({ round_id: round.id, attendee_id: attendeeId, organization_id: round.organization_id, score })
    .select("id")
    .single();
  if (resultError || !result) return NextResponse.json({ error: resultError?.message || "Không lưu được kết quả." }, { status: 400 });

  const responseRows = graded.map((r) => ({
    result_id: result.id,
    organization_id: round.organization_id,
    question_no: r.question_no,
    answer_text: r.answer_text,
    is_correct: r.is_correct,
  }));
  await admin.from("procedure_training_responses").insert(responseRows);

  return NextResponse.json({
    ok: true,
    score,
    scoreMax: round.score_max,
    total: graded.length,
    correctCount: graded.filter((r) => r.is_correct).length,
    perQuestion: graded.map((r) => {
      const q = questionByNo.get(r.question_no);
      const choices = Array.isArray(q?.choices) && q.choices.length > 1 ? q.choices : null;
      return {
        question_no: r.question_no,
        question_text: q?.question_text || `Câu ${r.question_no}`,
        choices,
        answer_text: r.answer_text,
        is_correct: r.is_correct,
      };
    }),
  });
}
