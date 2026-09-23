import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const CLOSE_RPC = "qlcl_close_fmea_v1";
const TRANSITION_RPC = "qlcl_transition_fmea_v1";
const TRANSITION_COMMANDS = new Set(["SUBMIT","APPROVE","REQUEST_RESIDUAL_REVIEW"]);
const MESSAGE:Record<string,string>={
  SUBMIT:"Đã gửi FMEA phê duyệt.",
  APPROVE:"Đã phê duyệt và chuyển triển khai can thiệp.",
  REQUEST_RESIDUAL_REVIEW:"Đã chuyển sang re-score và xem xét residual risk.",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "risk.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền quản lý FMEA/HFMEA." }, { status: 403 });

  const { id: recordId } = await params;
  const body: any = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const reason = String(body.comment || "").trim() || null;

  const { data: record } = await supabase
    .from("records")
    .select("id,lifecycle_status")
    .eq("id", recordId)
    .eq("record_type", "FMEA")
    .maybeSingle();

  if (!record) return NextResponse.json({ error: "Không tìm thấy FMEA hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "FMEA không còn hoạt động." }, { status: 409 });

  const admin = createAdminClient();

  if (TRANSITION_COMMANDS.has(command)) {
    const { data: tx, error: txError } = await admin.rpc(TRANSITION_RPC, {
      p_fmea_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_command: command,
      p_reason: reason,
    });

    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể cập nhật FMEA.");
      return NextResponse.json(
        { error: txMessage },
        { status: /không|chưa|cần|trạng thái|baseline|failure mode|action|minh chứng|ngoài phạm vi/i.test(txMessage) ? 409 : 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: tx?.workflow_status,
      message: MESSAGE[command] || "Đã cập nhật FMEA.",
      transaction: "atomic",
      result: tx,
    });
  }

  if (command === "CLOSE") {
    if (!reason) return NextResponse.json({ error: "Kết luận re-score và chấp nhận residual risk là bắt buộc." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(CLOSE_RPC, {
      p_fmea_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });

    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể đóng FMEA.");
      return NextResponse.json(
        { error: txMessage },
        { status: /not active|must be residual_review|action|evidence|required|not found|reassessment|không|chưa|cần/i.test(txMessage) ? 409 : 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: "CLOSED",
      message: "Đã đóng FMEA sau re-score và chấp nhận residual risk.",
      transaction: "atomic",
      result: tx,
    });
  }

  return NextResponse.json({ error: "Thao tác FMEA không hợp lệ." }, { status: 400 });
}
