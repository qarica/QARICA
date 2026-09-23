import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const text = (value: unknown) => String(value ?? "").trim();
const CREATE_FINDING_RPC = "qlcl_create_feedback_finding_v1";
const CLOSE_RPC = "qlcl_close_feedback_v1";
const TRANSITION_RPC = "qlcl_transition_feedback_v1";
const TRANSITION_COMMANDS = new Set(["TRIAGE","START_COORDINATION","MARK_RESPONDED"]);
const MESSAGE:Record<string,string>={
  TRIAGE:"Đã phân loại phản ánh.",
  START_COORDINATION:"Đã chuyển phối hợp xác minh/xử lý.",
  MARK_RESPONDED:"Đã ghi nhận phản hồi được gửi; luồng Finding vẫn tiếp tục độc lập.",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "feedback.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền xử lý phản ánh." }, { status: 403 });

  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const command = text(body.action).toUpperCase();
  const reason = text(body.comment) || null;

  const { data: visible } = await supabase
    .from("records")
    .select("id")
    .eq("id", recordId)
    .eq("record_type", "FEEDBACK")
    .maybeSingle();
  if (!visible) return NextResponse.json({ error: "Không tìm thấy phản ánh hoặc bạn không có quyền xem." }, { status: 404 });

  const admin = createAdminClient();

  if (TRANSITION_COMMANDS.has(command)) {
    if (command === "TRIAGE" && !reason) {
      return NextResponse.json({ error: "Cần ghi kết quả phân loại trước khi chuyển phối hợp." }, { status: 409 });
    }
    if (command === "MARK_RESPONDED" && !reason) {
      return NextResponse.json({ error: "Cần ghi nội dung phản hồi đã gửi." }, { status: 409 });
    }

    const { data: tx, error: txError } = await admin.rpc(TRANSITION_RPC, {
      p_feedback_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_command: command,
      p_reason: reason,
    });

    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể cập nhật phản ánh.");
      return NextResponse.json(
        { error: txMessage },
        { status: /không|chưa|cần|trạng thái|minh chứng|khoa\/phòng|ngoài phạm vi/i.test(txMessage) ? 409 : 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: tx?.workflow_status,
      message: MESSAGE[command] || "Đã cập nhật phản ánh.",
      transaction: "atomic",
      result: tx,
    });
  }

  if (command === "CREATE_FINDING") {
    const dueDate = text(body.due_date);
    if (!dueDate || !reason) {
      return NextResponse.json({ error: "Cần mô tả vấn đề hệ thống và hạn khắc phục." }, { status: 400 });
    }

    const { data: tx, error: txError } = await admin.rpc(CREATE_FINDING_RPC, {
      p_feedback_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
      p_due_date: dueDate,
      p_severity: text(body.severity) || "MAJOR",
    });

    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không tạo được Finding từ phản ánh.");
      return NextResponse.json({
        error: txMessage,
      }, {
        status: /đã có finding|chỉ sinh finding|không tìm thấy|bắt buộc|hạn khắc phục/i.test(txMessage) ? 409 : 400,
      });
    }

    const findingCode = tx && typeof tx === "object" && "finding_code" in tx
      ? String((tx as Record<string, unknown>).finding_code || "")
      : "";

    return NextResponse.json({
      ok: true,
      message: findingCode
        ? `Đã tạo Finding ${findingCode}; phản ánh gốc vẫn được giữ nguyên.`
        : "Đã tạo Finding; phản ánh gốc vẫn được giữ nguyên.",
      transaction: "atomic",
      result: tx,
    });
  }

  if (command === "CLOSE") {
    if (!reason) return NextResponse.json({ error: "Chỉ đóng sau khi đã phản hồi và có kết luận." }, { status: 409 });

    const { data: tx, error: txError } = await admin.rpc(CLOSE_RPC, {
      p_feedback_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });

    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể đóng phản ánh.");
      return NextResponse.json({
        error: txMessage,
      }, {
        status: /không còn hoạt động|chỉ đóng|không tìm thấy|trạng thái/i.test(txMessage) ? 409 : 400,
      });
    }

    return NextResponse.json({
      ok: true,
      status: "CLOSED",
      message: "Đã đóng luồng phản hồi; Finding/Action liên quan không bị đóng theo.",
      transaction: "atomic",
      result: tx,
    });
  }

  return NextResponse.json({ error: "Thao tác phản ánh không hợp lệ." }, { status: 400 });
}
