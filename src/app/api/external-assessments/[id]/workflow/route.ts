import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const text = (value: unknown) => String(value ?? "").trim();

const LINK_SELF_RPC = "qlcl_link_external_assessment_self_v1";
const SAVE_SCORE_RPC = "qlcl_save_external_assessment_score_v1";
const CLOSE_RPC = "qlcl_close_external_assessment_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const [{ data: manage }, { data: review }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "criteria.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "criteria.review" }),
  ]);
  if (!manage && !review) return NextResponse.json({ error: "Bạn chưa có quyền xử lý đánh giá ngoài." }, { status: 403 });

  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const command = text(body.action).toUpperCase();

  const { data: visible } = await supabase
    .from("records")
    .select("id")
    .eq("id", recordId)
    .eq("record_type", "EXTERNAL_ASSESSMENT")
    .maybeSingle();
  if (!visible) return NextResponse.json({ error: "Không tìm thấy hồ sơ đánh giá ngoài hoặc bạn không có quyền xem." }, { status: 404 });

  const admin = createAdminClient();

  if (command === "LINK_SELF") {
    const selfRecordId = text(body.self_record_id);
    if (!selfRecordId) return NextResponse.json({ error: "Cần chọn đợt tự đánh giá đã chốt để đối chiếu." }, { status: 400 });

    const { data: tx, error } = await admin.rpc(LINK_SELF_RPC, {
      p_external_record_id: recordId,
      p_self_record_id: selfRecordId,
      p_actor_user_id: auth.user.id,
    });
    if (error) {
      const message = rpcErrorMessage(error, "Không thể khóa đợt tự đánh giá dùng để đối chiếu.");
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      message: "Đã khóa đợt tự đánh giá dùng để đối chiếu.",
      transaction: "atomic",
      result: tx,
    });
  }

  if (command === "SAVE_EXTERNAL_SCORE") {
    const criterionId = text(body.criteria_item_id);
    const rawScore = body.external_score;
    const externalScore = rawScore === "" || rawScore == null ? null : Number(rawScore);
    const note = text(body.note);
    if (!criterionId || externalScore == null || !Number.isFinite(externalScore)) {
      return NextResponse.json({ error: "Cần chọn tiêu chí và nhập điểm đoàn Sở Y tế hợp lệ." }, { status: 400 });
    }

    const { data: tx, error } = await admin.rpc(SAVE_SCORE_RPC, {
      p_external_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_criteria_item_id: criterionId,
      p_external_score: externalScore,
      p_note: note || null,
    });
    if (error) {
      const message = rpcErrorMessage(error, "Không thể lưu điểm đoàn Sở Y tế để đối chiếu.");
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      message: "Đã lưu điểm đoàn Sở Y tế để đối chiếu.",
      transaction: "atomic",
      result: tx,
    });
  }

  if (command === "CLOSE_COMPARISON") {
    if (!manage) return NextResponse.json({ error: "Chỉ người quản lý bộ tiêu chí được chốt đối chiếu." }, { status: 403 });
    const reason = text(body.comment);
    if (!reason) return NextResponse.json({ error: "Kết luận đối chiếu là bắt buộc." }, { status: 400 });

    const { data: tx, error } = await admin.rpc(CLOSE_RPC, {
      p_external_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });
    if (error) {
      const message = rpcErrorMessage(error, "Không thể chốt kết quả đối chiếu đánh giá ngoài.");
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      message: "Đã chốt kết quả đối chiếu đánh giá ngoài.",
      transaction: "atomic",
      result: tx,
    });
  }

  return NextResponse.json({ error: "Thao tác đánh giá ngoài không hợp lệ." }, { status: 400 });
}
