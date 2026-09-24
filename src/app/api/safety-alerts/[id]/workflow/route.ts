import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const TRANSITION_RPC = "qlcl_transition_safety_alert_v1";
const CLOSE_COMMANDS = new Set(["RETURN","PUBLISH","ARCHIVE"]);
const MESSAGE:Record<string,string>={
  SUBMIT_REVIEW:"Đã gửi nội dung cảnh báo để rà soát.",
  RETURN:"Đã trả lại nội dung để chỉnh sửa.",
  PUBLISH:"Đã phát hành bài học/cảnh báo an toàn.",
  ARCHIVE:"Đã lưu cảnh báo hết hiệu lực; lịch sử phát hành được giữ nguyên.",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const [{ data: canEdit }, { data: canPublish }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "safety_alert.edit" }),
    supabase.rpc("has_permission", { p_permission_code: "safety_alert.publish" }),
  ]);
  if (!canEdit && !canPublish) return NextResponse.json({ error: "Bạn chưa có quyền xử lý cảnh báo an toàn." }, { status: 403 });

  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const reason = String(body.comment || "").trim() || null;

  if (!["SUBMIT_REVIEW","RETURN","PUBLISH","ARCHIVE"].includes(command)) {
    return NextResponse.json({ error: "Thao tác cảnh báo không hợp lệ." }, { status: 400 });
  }
  if (command === "SUBMIT_REVIEW" && !canEdit) {
    return NextResponse.json({ error: "Bạn cần quyền soạn cảnh báo để gửi rà soát." }, { status: 403 });
  }
  if (CLOSE_COMMANDS.has(command) && !canPublish) {
    return NextResponse.json({ error: "Bạn cần quyền phê duyệt/phát hành cảnh báo để thực hiện thao tác này." }, { status: 403 });
  }
  if (CLOSE_COMMANDS.has(command) && !reason) {
    return NextResponse.json({
      error: command === "RETURN"
        ? "Cần lý do trả lại."
        : command === "PUBLISH"
          ? "Cần kết luận phát hành."
          : "Cần lý do lưu hết hiệu lực.",
    }, { status: 409 });
  }

  const { data: visible } = await supabase
    .from("records")
    .select("id")
    .eq("id", recordId)
    .eq("record_type", "SAFETY_ALERT")
    .maybeSingle();
  if (!visible) return NextResponse.json({ error: "Không tìm thấy bài học/cảnh báo." }, { status: 404 });

  const admin = createAdminClient();
  const { data: tx, error: txError } = await admin.rpc(TRANSITION_RPC, {
    p_alert_record_id: recordId,
    p_actor_user_id: auth.user.id,
    p_command: command,
    p_reason: reason,
  });

  if (txError) {
    const txMessage = rpcErrorMessage(txError, "Không thể cập nhật cảnh báo an toàn.");
    return NextResponse.json(
      { error: txMessage },
      { status: /không|chưa|cần|trạng thái|minh chứng|ngoài phạm vi/i.test(txMessage) ? 409 : 400 },
    );
  }

  const result = tx && typeof tx === "object" ? tx as Record<string, unknown> : {};
  return NextResponse.json({
    ok: true,
    status: typeof result.status === "string" ? result.status : undefined,
    message: MESSAGE[command] || "Đã cập nhật cảnh báo.",
    transaction: "atomic",
    result: tx,
  });
}
