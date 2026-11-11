import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

function isFiniteOrNull(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isFinite(v));
}

// Ghi bản xem trước (có thể người dùng đã chỉnh sửa/bỏ bớt dòng) vào
// procedure_training_attendees — insert cho người mới, update cho người đã
// có sẵn trong roster (import Post-test sau khi Pre-test đã nhập từ trước,
// hoặc ngược lại). Không tin dữ liệu client gửi lên là đã đúng quyền sở hữu
// — luôn kiểm tra lại attendeeId thuộc đúng training_id + organization_id
// trước khi update.
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
  const actions = Array.isArray(body.actions) ? body.actions : [];
  if (!actions.length) return NextResponse.json({ error: "Không có dòng nào để lưu." }, { status: 400 });

  const inserts: Record<string, unknown>[] = [];
  const updates: { attendeeId: string; preScore: number | null; postScore: number | null }[] = [];
  const errors: string[] = [];

  for (const action of actions) {
    if (action?.type === "insert") {
      const employeeName = String(action.employeeName || "").trim();
      if (!employeeName) {
        errors.push("Bỏ qua 1 dòng thêm mới vì thiếu tên.");
        continue;
      }
      if (!isFiniteOrNull(action.preScore) || !isFiniteOrNull(action.postScore)) {
        errors.push(`Bỏ qua "${employeeName}" vì điểm không hợp lệ.`);
        continue;
      }
      inserts.push({
        training_id: trainingId,
        organization_id: organizationId,
        employee_name: employeeName,
        employee_code: action.employeeCode ? String(action.employeeCode).trim() || null : null,
        attended: true,
        attended_at: new Date().toISOString().slice(0, 10),
        pre_test_score: action.preScore,
        post_test_score: action.postScore,
        notes: [action.dept ? `Đơn vị: ${action.dept}` : null, action.title ? `Chức danh: ${action.title}` : null].filter(Boolean).join(" · ") || null,
      });
    } else if (action?.type === "update") {
      const attendeeId = String(action.attendeeId || "");
      if (!attendeeId || !isFiniteOrNull(action.preScore) || !isFiniteOrNull(action.postScore)) {
        errors.push(`Bỏ qua cập nhật "${action.employeeName || attendeeId}" vì dữ liệu không hợp lệ.`);
        continue;
      }
      updates.push({ attendeeId, preScore: action.preScore, postScore: action.postScore });
    }
  }

  let insertedCount = 0;
  if (inserts.length) {
    const { data, error } = await admin.from("procedure_training_attendees").insert(inserts).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    insertedCount = data?.length ?? 0;
  }

  let updatedCount = 0;
  for (const u of updates) {
    const { error, count } = await admin
      .from("procedure_training_attendees")
      .update({ pre_test_score: u.preScore, post_test_score: u.postScore, updated_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", u.attendeeId)
      .eq("training_id", trainingId)
      .eq("organization_id", organizationId);
    if (error) {
      errors.push(`Không cập nhật được 1 người: ${error.message}`);
      continue;
    }
    updatedCount += count ?? 0;
  }

  return NextResponse.json({ ok: true, insertedCount, updatedCount, errors });
}
