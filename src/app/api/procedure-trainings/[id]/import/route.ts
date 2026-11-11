import { readSheet } from "read-excel-file/node";
import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyAnswerKey, buildImportPlan, detectColumns, parseRows, type ExistingAttendee, type ImportGroup } from "@/lib/training-import";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function readFirstSheetRows(buffer: Buffer): Promise<unknown[][]> {
  const rows = await readSheet(buffer);
  return rows.map((row) => row.map((cell) => (cell instanceof Date ? cell.toISOString().slice(0, 10) : cell)));
}

// Đọc file khảo sát thô (Google/Microsoft Form xuất ra) HOẶC file đã chấm
// sẵn (có cột Điểm), tự suy ra cột từ chính file (không giả định cố định số
// câu hỏi — xem src/lib/training-import.ts), ghép Pre/Post với roster đã có
// + ghép trong cùng file, rồi trả về bản xem trước — KHÔNG ghi gì vào DB ở
// bước này, chỉ /import/commit mới ghi.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("procedure_training.manage");
  if (!auth.ok) return auth.response;
  const { id: trainingId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: training } = await admin.from("procedure_trainings").select("id,test_score_max").eq("id", trainingId).eq("organization_id", organizationId).maybeSingle();
  if (!training) return NextResponse.json({ error: "Không tìm thấy quy trình." }, { status: 404 });

  const formData = await request.formData().catch(() => null);
  const fileValue = formData?.get("file");
  if (!(fileValue instanceof File)) return NextResponse.json({ error: "Vui lòng chọn file." }, { status: 400 });
  if (fileValue.size <= 0) return NextResponse.json({ error: "File đang trống." }, { status: 400 });
  if (fileValue.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Dung lượng file tối đa là 10 MB." }, { status: 400 });

  let sheetRows: unknown[][];
  try {
    sheetRows = await readFirstSheetRows(Buffer.from(await fileValue.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "Không đọc được file. Chỉ hỗ trợ .xlsx." }, { status: 400 });
  }
  if (sheetRows.length < 2) return NextResponse.json({ error: "File không có dữ liệu (cần ít nhất 1 dòng tiêu đề + 1 dòng dữ liệu)." }, { status: 400 });

  const [headerRow, ...dataRows] = sheetRows;
  const columns = detectColumns(headerRow);
  if (columns.nameIdx === -1) {
    return NextResponse.json({ error: "Không tìm thấy cột Họ tên trong file. Cần có 1 cột tiêu đề chứa 'Họ tên'." }, { status: 400 });
  }
  if (!columns.questionIdxs.length && columns.scoreIdx == null) {
    return NextResponse.json({ error: "Không tìm thấy cột câu hỏi (tiêu đề bắt đầu bằng 'Câu') hoặc cột Điểm có sẵn trong file." }, { status: 400 });
  }

  const defaultGroupRaw = String(formData?.get("default_group") || "");
  const defaultGroup: ImportGroup = defaultGroupRaw === "POST" ? "POST" : "PRE";
  const rawRows = parseRows(dataRows, columns, defaultGroup);
  if (!rawRows.length) return NextResponse.json({ error: "Không có dòng dữ liệu hợp lệ (thiếu Họ tên ở mọi dòng)." }, { status: 400 });

  const { data: questionRows } = await admin.from("procedure_training_questions").select("question_no,correct_answer").eq("training_id", trainingId).order("question_no");
  const answerKey = (questionRows ?? []).map((q) => q.correct_answer);

  const scoredRows = applyAnswerKey(rawRows, answerKey.length ? answerKey : null);
  const scoringSkippedCount = scoredRows.filter((r) => r.scoringSkipped).length;

  const { data: attendeeRows } = await admin
    .from("procedure_training_attendees")
    .select("id,employee_name,employee_code,pre_test_score,post_test_score")
    .eq("training_id", trainingId);
  const existing: ExistingAttendee[] = (attendeeRows ?? []).map((a) => ({
    id: a.id,
    employeeName: a.employee_name,
    employeeCode: a.employee_code,
    preScore: a.pre_test_score,
    postScore: a.post_test_score,
  }));

  const actions = buildImportPlan(scoredRows, existing);

  return NextResponse.json({
    ok: true,
    actions,
    rowCount: rawRows.length,
    questionCount: columns.questionIdxs.length,
    scoreMaxFromHeader: columns.scoreMaxFromHeader,
    currentScoreMax: training.test_score_max,
    hasAnswerKey: answerKey.length > 0,
    hasGroupColumn: columns.groupIdx != null,
    scoringSkippedCount,
  });
}
