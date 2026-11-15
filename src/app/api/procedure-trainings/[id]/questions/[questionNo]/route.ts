import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS = "id,question_no,correct_answer,question_text,choices";

// Sửa nội dung hiển thị công khai (question_text/choices) của 1 câu —
// TÁCH RIÊNG khỏi PUT /questions (thay toàn bộ đáp án đúng) vì soạn nội
// dung câu hỏi để cho làm bài qua QR là việc làm từng câu một, không phải
// dán lại cả danh sách đáp án mỗi lần sửa 1 câu.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; questionNo: string }> }) {
  const auth = await requireApiPermission("procedure_training.manage");
  if (!auth.ok) return auth.response;
  const { id: trainingId, questionNo } = await params;
  const qNo = Number(questionNo);
  if (!Number.isFinite(qNo) || qNo <= 0) return NextResponse.json({ error: "Số thứ tự câu hỏi không hợp lệ." }, { status: 400 });

  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: training } = await admin.from("procedure_trainings").select("id").eq("id", trainingId).eq("organization_id", organizationId).maybeSingle();
  if (!training) return NextResponse.json({ error: "Không tìm thấy quy trình." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (body.question_text !== undefined) update.question_text = String(body.question_text).trim() || null;
  if (body.choices !== undefined) {
    const choices = Array.isArray(body.choices) ? body.choices.map((c: unknown) => String(c ?? "").trim()).filter(Boolean) : [];
    update.choices = choices.length > 1 ? choices : null;
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "Không có thay đổi nào." }, { status: 400 });

  const { data, error } = await admin
    .from("procedure_training_questions")
    .update(update)
    .eq("training_id", trainingId)
    .eq("organization_id", organizationId)
    .eq("question_no", qNo)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy câu hỏi." }, { status: 404 });
  return NextResponse.json({ ok: true, question: data });
}
