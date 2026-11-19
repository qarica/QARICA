import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS =
  "id,procedure_code,procedure_name,drafting_unit,effective_date,trainer,session_1_time,session_1_location,session_1_method,status,feedback_qlcl,notes,test_score_max,pass_threshold,is_open_for_registration";

const EDITABLE_FIELDS = [
  "trainer",
  "session_1_time",
  "session_1_location",
  "session_1_method",
  "status",
  "feedback_qlcl",
  "notes",
  "test_score_max",
  "pass_threshold",
  "is_open_for_registration",
];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("procedure_training.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    if (field === "status") {
      if (!["TRAINED", "PLANNED", "NOT_PLANNED"].includes(body.status)) {
        return NextResponse.json({ error: "Tình trạng không hợp lệ." }, { status: 400 });
      }
      update.status = body.status;
    } else if (field === "test_score_max") {
      if (body.test_score_max === null || body.test_score_max === "") {
        update.test_score_max = null;
      } else {
        const parsed = Number(body.test_score_max);
        if (!Number.isFinite(parsed) || parsed <= 0) return NextResponse.json({ error: "Thang điểm bài test không hợp lệ." }, { status: 400 });
        update.test_score_max = parsed;
      }
    } else if (field === "pass_threshold") {
      if (body.pass_threshold === null || body.pass_threshold === "") {
        update.pass_threshold = null;
      } else {
        const parsed = Number(body.pass_threshold);
        if (!Number.isFinite(parsed) || parsed < 0) return NextResponse.json({ error: "Điểm đạt không hợp lệ." }, { status: 400 });
        update.pass_threshold = parsed;
      }
    } else if (field === "is_open_for_registration") {
      update.is_open_for_registration = body.is_open_for_registration === true;
    } else {
      update[field] = String(body[field]).trim() || null;
    }
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "Không có thay đổi nào." }, { status: 400 });
  update.updated_at = new Date().toISOString();

  // Báo cáo thực tế: "Khi bấm hoàn thành thì phải tắt mở các link quét QR"
  // — lớp đã hoàn thành đào tạo (status="TRAINED") không còn cần ai quét QR
  // để đăng ký hay làm bài tự test nữa; để hở link công khai sau khi hoàn
  // thành dễ phát sinh dữ liệu rác (đăng ký/nộp bài trễ cho 1 lớp coi như đã
  // xong). Đóng cả 2: is_open_for_registration của lớp, và is_open_for_
  // submission của MỌI đợt kiểm tra (procedure_training_rounds) thuộc lớp
  // này — ép ở API để đúng dù bấm từ nút "Hoàn thành lớp" hay từ form sửa
  // thường, không chỉ riêng 1 chỗ gọi (CLAUDE.md nguyên tắc 2).
  if (update.status === "TRAINED") {
    update.is_open_for_registration = false;
  }

  const { data, error } = await admin
    .from("procedure_trainings")
    .update(update)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy quy trình." }, { status: 404 });

  if (update.status === "TRAINED") {
    await admin.from("procedure_training_rounds").update({ is_open_for_submission: false }).eq("training_id", id).eq("organization_id", organizationId);
  }

  return NextResponse.json({ ok: true, training: data });
}

// Báo cáo thực tế: "Lớp tạo nhầm cũng không xóa được" — chưa từng có cách
// xoá cả 1 lớp (procedure_trainings), chỉ xoá được từng đợt kiểm tra/nhân
// sự/đăng ký riêng lẻ. Mọi bảng con (attendees, registrations, rounds →
// results → responses, questions) đều "on delete cascade" theo training_id
// (xem các migration liên quan) nên chỉ cần xoá đúng 1 dòng procedure_trainings
// — không có bảng/nguồn sự thật phụ nào sót lại (CLAUDE.md nguyên tắc 2).
//
// Báo cáo thực tế tiếp theo: "Khi bấm nút hoàn thành lớp thì không cho phép
// xoá lớp" — 1 lớp đã đánh dấu status="TRAINED" (Đã đào tạo) là dữ liệu đã
// hoàn thành, chặn xoá để không mất kết quả đào tạo thật đã ghi nhận; muốn
// xoá phải đổi tình trạng về PLANNED/NOT_PLANNED trước (qua PATCH ở trên).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("procedure_training.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: existing } = await admin.from("procedure_trainings").select("status").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Không tìm thấy quy trình." }, { status: 404 });
  if (existing.status === "TRAINED") {
    return NextResponse.json({ error: "Lớp này đã hoàn thành đào tạo, không thể xoá. Đổi tình trạng về \"Đã có kế hoạch\"/\"Chưa có kế hoạch\" trước nếu vẫn muốn xoá." }, { status: 409 });
  }

  const { data, error } = await admin.from("procedure_trainings").delete().eq("id", id).eq("organization_id", organizationId).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy quy trình." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
