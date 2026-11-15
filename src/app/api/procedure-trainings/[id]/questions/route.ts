import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS = "id,question_no,correct_answer,question_text,choices";

// Đáp án đúng để tự chấm điểm khi import file khảo sát thô — số câu khác
// nhau giữa các đợt đào tạo nên lưu 1 hàng/câu (không cố định số dòng), xem
// migration 20261129000000_procedure_training_questions_v1.sql.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("procedure_training.view");
  if (!auth.ok) return auth.response;
  const { id: trainingId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: training } = await admin.from("procedure_trainings").select("id").eq("id", trainingId).eq("organization_id", organizationId).maybeSingle();
  if (!training) return NextResponse.json({ error: "Không tìm thấy quy trình." }, { status: 404 });

  const { data, error } = await admin.from("procedure_training_questions").select(SELECT_COLUMNS).eq("training_id", trainingId).order("question_no");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, questions: data ?? [] });
}

// Thay toàn bộ đáp án (xoá hết + ghi lại danh sách mới) — đáp án thường chỉ
// khai báo 1 lần rồi hiệu chỉnh cả danh sách cùng lúc (dán từ file đáp án),
// không cần sửa từng câu riêng lẻ.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("procedure_training.manage");
  if (!auth.ok) return auth.response;
  const { id: trainingId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: training } = await admin.from("procedure_trainings").select("id").eq("id", trainingId).eq("organization_id", organizationId).maybeSingle();
  if (!training) return NextResponse.json({ error: "Không tìm thấy quy trình." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const answers = Array.isArray(body.answers) ? body.answers : null;
  if (!answers) return NextResponse.json({ error: "Thiếu danh sách đáp án." }, { status: 400 });
  const cleaned = answers.map((a: unknown) => String(a ?? "").trim()).filter((a: string) => a.length > 0);
  if (!cleaned.length) return NextResponse.json({ error: "Danh sách đáp án đang trống." }, { status: 400 });

  // Giữ lại question_text/choices (nội dung câu hỏi dùng khi cho làm bài qua
  // QR) theo đúng question_no cũ — PUT này chỉ thay đáp án đúng, không được
  // xoá mất nội dung câu hỏi đã soạn riêng (PATCH .../questions/[questionNo]).
  const { data: existing } = await admin.from("procedure_training_questions").select("question_no,question_text,choices").eq("training_id", trainingId).eq("organization_id", organizationId);
  const existingByNo = new Map((existing ?? []).map((q) => [q.question_no, q]));

  const { error: deleteError } = await admin.from("procedure_training_questions").delete().eq("training_id", trainingId).eq("organization_id", organizationId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

  const rows = cleaned.map((correct_answer: string, idx: number) => {
    const questionNo = idx + 1;
    const prior = existingByNo.get(questionNo);
    return {
      training_id: trainingId,
      organization_id: organizationId,
      question_no: questionNo,
      correct_answer,
      question_text: prior?.question_text ?? null,
      choices: prior?.choices ?? null,
    };
  });
  const { data, error } = await admin.from("procedure_training_questions").insert(rows).select(SELECT_COLUMNS).order("question_no");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, questions: data ?? [] });
}
