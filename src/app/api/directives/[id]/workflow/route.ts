import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const COMPLETE_RPC = "qlcl_complete_directive_v1";
const TRANSITION_RPC = "qlcl_transition_directive_v1";
const TRANSITION_COMMANDS = new Set(["ASSIGN","START","SUBMIT_EVIDENCE","RETURN"]);

const MESSAGE:Record<string,string>={
  ASSIGN:"Đã xác nhận phân công yêu cầu.",
  START:"Đã bắt đầu thực hiện yêu cầu.",
  SUBMIT_EVIDENCE:"Đã gửi kết quả và minh chứng để xác nhận.",
  RETURN:"Đã trả lại để bổ sung kết quả/minh chứng.",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "directives.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền xử lý chỉ đạo/yêu cầu." }, { status: 403 });

  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const reason = String(body.comment || "").trim() || null;

  const { data: visible } = await supabase
    .from("records")
    .select("id")
    .eq("id", recordId)
    .eq("record_type", "DIRECTIVE")
    .maybeSingle();

  if (!visible) return NextResponse.json({ error: "Không tìm thấy yêu cầu hoặc bạn không có quyền xem." }, { status: 404 });

  const admin = createAdminClient();

  if (command === "COMPLETE") {
    if (!reason) return NextResponse.json({ error: "Cần kết luận xác nhận hoàn tất." }, { status: 409 });

    const { data: tx, error: txError } = await admin.rpc(COMPLETE_RPC, {
      p_directive_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });

    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể xác nhận hoàn tất yêu cầu.");
      return NextResponse.json(
        { error: txMessage },
        { status: /not active|must be evidence_submitted|action|evidence|required|not found|không|chưa|cần/i.test(txMessage) ? 409 : 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: "COMPLETED",
      message: "Đã xác nhận hoàn tất yêu cầu.",
      transaction: "atomic",
      result: tx,
    });
  }

  if (!TRANSITION_COMMANDS.has(command)) {
    return NextResponse.json({ error: "Thao tác yêu cầu không hợp lệ." }, { status: 400 });
  }

  if (command === "RETURN" && !reason) {
    return NextResponse.json({ error: "Cần lý do trả lại bổ sung." }, { status: 409 });
  }

  const { data: tx, error: txError } = await admin.rpc(TRANSITION_RPC, {
    p_directive_record_id: recordId,
    p_actor_user_id: auth.user.id,
    p_command: command,
    p_reason: reason,
  });

  if (txError) {
    const txMessage = rpcErrorMessage(txError, "Không thể cập nhật yêu cầu.");
    return NextResponse.json(
      { error: txMessage },
      { status: /không|chưa|cần|trạng thái|action|minh chứng|phân công|ngoài phạm vi/i.test(txMessage) ? 409 : 400 },
    );
  }

  const result = tx && typeof tx === "object" ? tx as Record<string, unknown> : {};
  return NextResponse.json({
    ok: true,
    status: typeof result.workflow_status === "string" ? result.workflow_status : undefined,
    message: MESSAGE[command] || "Đã cập nhật yêu cầu.",
    transaction: "atomic",
    result: tx,
  });
}
