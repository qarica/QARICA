import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const SUBMIT_RPC = "qlcl_submit_report_v1";
const COMPLETE_RPC = "qlcl_confirm_report_received_v1";
const TRANSITION_RPC = "qlcl_transition_report_v1";
const TRANSITION_COMMANDS = new Set(["START_PREPARING","SUBMIT_REVIEW","RETURN"]);

const MESSAGE:Record<string,string>={
  START_PREPARING:"Đã bắt đầu chuẩn bị báo cáo.",
  SUBMIT_REVIEW:"Đã gửi báo cáo để rà soát.",
  RETURN:"Đã trả lại báo cáo để chỉnh sửa.",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "reports.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền xử lý báo cáo." }, { status: 403 });

  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const reason = String(body.comment || "").trim() || null;

  const { data: visible } = await supabase
    .from("records")
    .select("id")
    .eq("id", recordId)
    .eq("record_type", "REPORT")
    .maybeSingle();

  if (!visible) return NextResponse.json({ error: "Không tìm thấy báo cáo hoặc bạn không có quyền xem." }, { status: 404 });

  const admin = createAdminClient();

  if (TRANSITION_COMMANDS.has(command)) {
    if (command === "RETURN" && !reason) {
      return NextResponse.json({ error: "Cần lý do trả lại báo cáo." }, { status: 409 });
    }

    const { data: tx, error: txError } = await admin.rpc(TRANSITION_RPC, {
      p_report_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_command: command,
      p_reason: reason,
    });

    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể cập nhật báo cáo.");
      return NextResponse.json(
        { error: txMessage },
        { status: /không|chưa|cần|trạng thái|action|minh chứng|owner|hạn|nơi nhận|ngoài phạm vi/i.test(txMessage) ? 409 : 400 },
      );
    }

    const result = tx && typeof tx === "object" ? tx as Record<string, unknown> : {};
    return NextResponse.json({
      ok: true,
      status: typeof result.workflow_status === "string" ? result.workflow_status : undefined,
      message: MESSAGE[command] || "Đã cập nhật báo cáo.",
      transaction: "atomic",
      result: tx,
    });
  }

  if (command === "SUBMIT") {
    if (!reason) return NextResponse.json({ error: "Cần kết luận rà soát trước khi gửi báo cáo." }, { status: 409 });

    const { data: report } = await admin
      .from("reporting_obligations")
      .select("submission_method")
      .eq("record_id", recordId)
      .maybeSingle();

    const channel = String(body.channel || report?.submission_method || "OTHER");
    const officialDocumentNumber = String(body.official_document_number || "").trim() || null;
    const { data: tx, error: txError } = await admin.rpc(SUBMIT_RPC, {
      p_report_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
      p_channel: channel,
      p_official_document_number: officialDocumentNumber,
    });

    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể ghi nhận lần gửi báo cáo.");
      return NextResponse.json(
        { error: txMessage },
        { status: /not active|must be reviewing|required|evidence|recipient|không|chưa|cần/i.test(txMessage) ? 409 : 400 },
      );
    }

    const version = typeof tx === "object" && tx && "submission_version" in tx
      ? Number((tx as Record<string, unknown>).submission_version || 0)
      : 0;

    return NextResponse.json({
      ok: true,
      status: "SUBMITTED",
      message: version ? `Đã ghi nhận lần gửi báo cáo số ${version}.` : "Đã ghi nhận lần gửi báo cáo.",
      transaction: "atomic",
      result: tx,
    });
  }

  if (command === "CONFIRM_RECEIVED") {
    if (!reason) return NextResponse.json({ error: "Cần xác nhận đã gửi/tiếp nhận để hoàn tất." }, { status: 409 });

    const { data: tx, error: txError } = await admin.rpc(COMPLETE_RPC, {
      p_report_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });

    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể hoàn tất nghĩa vụ báo cáo.");
      return NextResponse.json(
        { error: txMessage },
        { status: /not active|must be submitted|required|no report submission|evidence|không|chưa|cần/i.test(txMessage) ? 409 : 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: "COMPLETED",
      message: "Đã hoàn tất nghĩa vụ báo cáo với bằng chứng gửi/tiếp nhận.",
      transaction: "atomic",
      result: tx,
    });
  }

  return NextResponse.json({ error: "Thao tác báo cáo không hợp lệ." }, { status: 400 });
}
