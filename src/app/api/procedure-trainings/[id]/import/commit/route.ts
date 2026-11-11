import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

type IncomingResult = { roundLabel?: unknown; score?: unknown; responses?: unknown };
type IncomingAction =
  | { type: "insert"; employeeName?: unknown; employeeCode?: unknown; dept?: unknown; title?: unknown; results?: IncomingResult[] }
  | { type: "update"; attendeeId?: unknown; employeeName?: unknown; results?: IncomingResult[] };

function isFiniteOrNull(v: unknown): v is number | null {
  return v === null || v === undefined || (typeof v === "number" && Number.isFinite(v));
}

function normalizeResponses(raw: unknown): { question_no: number; answer_text: string | null; is_correct: boolean | null }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: { questionNo?: unknown; answerText?: unknown; isCorrect?: unknown }) => ({
      question_no: Number(r.questionNo),
      answer_text: r.answerText != null ? String(r.answerText) : null,
      is_correct: typeof r.isCorrect === "boolean" ? r.isCorrect : null,
    }))
    .filter((r) => Number.isFinite(r.question_no) && r.question_no > 0);
}

// Ghi bản xem trước (có thể người dùng đã chỉnh sửa/bỏ bớt dòng) vào
// procedure_training_attendees + procedure_training_results (+ responses
// khi có) — insert cho người mới, update cho người đã có sẵn trong roster.
// Đợt kiểm tra (round) được find-or-create theo tên 1 lần cho cả batch,
// không lặp lại theo từng dòng. Không tin dữ liệu client gửi lên là đã đúng
// quyền sở hữu — luôn kiểm tra lại attendeeId thuộc đúng training_id +
// organization_id trước khi ghi kết quả.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const actions: IncomingAction[] = Array.isArray(body.actions) ? body.actions : [];
  if (!actions.length) return NextResponse.json({ error: "Không có dòng nào để lưu." }, { status: 400 });

  // Find-or-create mọi đợt kiểm tra xuất hiện trong batch này, 1 lần duy
  // nhất — tránh tạo trùng/đua nhau tạo nếu lặp theo từng dòng.
  const roundLabels = new Set<string>();
  for (const a of actions) for (const r of a.results || []) if (typeof r.roundLabel === "string" && r.roundLabel.trim()) roundLabels.add(r.roundLabel.trim());

  const { data: existingRounds } = await admin.from("procedure_training_rounds").select("id,round_label").eq("training_id", trainingId);
  const roundIdByLabel = new Map((existingRounds ?? []).map((r) => [r.round_label, r.id]));
  const missingLabels = Array.from(roundLabels).filter((l) => !roundIdByLabel.has(l));
  if (missingLabels.length) {
    const { data: createdRounds, error: createRoundsError } = await admin
      .from("procedure_training_rounds")
      .insert(missingLabels.map((round_label, idx) => ({ training_id: trainingId, organization_id: organizationId, round_label, sort_order: (existingRounds?.length ?? 0) + idx })))
      .select("id,round_label");
    if (createRoundsError) return NextResponse.json({ error: `Không tạo được đợt kiểm tra: ${createRoundsError.message}` }, { status: 400 });
    for (const r of createdRounds ?? []) roundIdByLabel.set(r.round_label, r.id);
  }

  const errors: string[] = [];
  let insertedCount = 0;
  let updatedCount = 0;

  async function writeResults(attendeeId: string, employeeLabel: string, results: IncomingResult[]) {
    for (const r of results) {
      const roundLabel = typeof r.roundLabel === "string" ? r.roundLabel.trim() : "";
      const roundId = roundLabel ? roundIdByLabel.get(roundLabel) : undefined;
      if (!roundId) {
        errors.push(`Bỏ qua kết quả "${roundLabel || "?"}" của "${employeeLabel}" vì thiếu đợt kiểm tra.`);
        continue;
      }
      if (!isFiniteOrNull(r.score)) {
        errors.push(`Bỏ qua kết quả đợt "${roundLabel}" của "${employeeLabel}" vì điểm không hợp lệ.`);
        continue;
      }
      const { data: result, error } = await admin
        .from("procedure_training_results")
        .upsert({ round_id: roundId, attendee_id: attendeeId, organization_id: organizationId, score: r.score ?? null, updated_at: new Date().toISOString() }, { onConflict: "round_id,attendee_id" })
        .select("id")
        .single();
      if (error) {
        errors.push(`Không lưu được kết quả đợt "${roundLabel}" của "${employeeLabel}": ${error.message}`);
        continue;
      }
      const responseRows = normalizeResponses(r.responses);
      if (responseRows.length) {
        await admin.from("procedure_training_responses").delete().eq("result_id", result.id);
        await admin.from("procedure_training_responses").insert(responseRows.map((rr) => ({ ...rr, result_id: result.id, organization_id: organizationId })));
      }
    }
  }

  for (const action of actions) {
    if (action?.type === "insert") {
      const employeeName = String(action.employeeName || "").trim();
      if (!employeeName) {
        errors.push("Bỏ qua 1 dòng thêm mới vì thiếu tên.");
        continue;
      }
      const { data: attendee, error } = await admin
        .from("procedure_training_attendees")
        .insert({
          training_id: trainingId,
          organization_id: organizationId,
          employee_name: employeeName,
          employee_code: action.employeeCode ? String(action.employeeCode).trim() || null : null,
          department: action.dept ? String(action.dept).trim() || null : null,
          job_title: action.title ? String(action.title).trim() || null : null,
          attended: true,
          attended_at: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (error) {
        errors.push(`Không thêm được "${employeeName}": ${error.message}`);
        continue;
      }
      insertedCount += 1;
      await writeResults(attendee.id, employeeName, action.results || []);
    } else if (action?.type === "update") {
      const attendeeId = String(action.attendeeId || "");
      const employeeName = String(action.employeeName || attendeeId);
      if (!attendeeId) {
        errors.push(`Bỏ qua cập nhật "${employeeName}" vì thiếu attendeeId.`);
        continue;
      }
      const { data: attendee } = await admin.from("procedure_training_attendees").select("id").eq("id", attendeeId).eq("training_id", trainingId).eq("organization_id", organizationId).maybeSingle();
      if (!attendee) {
        errors.push(`Bỏ qua cập nhật "${employeeName}" vì không tìm thấy trong roster.`);
        continue;
      }
      updatedCount += 1;
      await writeResults(attendeeId, employeeName, action.results || []);
    }
  }

  return NextResponse.json({ ok: true, insertedCount, updatedCount, errors });
}
