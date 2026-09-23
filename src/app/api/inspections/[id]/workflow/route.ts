import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const COUNTDOWN_RPC = "qlcl_generate_inspection_countdown_v1";
const CLOSE_RPC = "qlcl_close_inspection_v1";
const TRANSITION_RPC = "qlcl_transition_inspection_v1";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const [{ data: canInspect }, { data: canPlan }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "inspections.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "plans.manage" }),
  ]);
  if (!canInspect && !canPlan) return NextResponse.json({ error: "Bạn chưa có quyền quản lý tiếp đoàn." }, { status: 403 });

  const { id: recordId } = await params;
  const body: any = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const { data: record } = await supabase.from("records").select("id,organization_id,record_code,title,work_year,lifecycle_status").eq("id", recordId).eq("record_type", "INSPECTION").maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy đợt tiếp đoàn hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Đợt tiếp đoàn không còn hoạt động." }, { status: 409 });

  const admin: any = createAdminClient();
  const { data: event, error } = await admin.from("inspection_events").select("id,visit_date,workflow_status").eq("record_id", recordId).maybeSingle();
  if (error || !event) return NextResponse.json({ error: error?.message || "Không tìm thấy dữ liệu tiếp đoàn." }, { status: 404 });

  const oldStatus = String(event.workflow_status || "PLANNING");
  const reason = String(body.comment || "").trim() || null;

  if (command === "GENERATE_COUNTDOWN") {
    if (!["PLANNING", "PREPARATION"].includes(oldStatus)) return NextResponse.json({ error: "Chỉ được tạo countdown trong giai đoạn chuẩn bị." }, { status: 409 });
    if (!event.visit_date) return NextResponse.json({ error: "Chưa có ngày đoàn đến; hệ thống không tự bịa lịch." }, { status: 409 });

    const dept = String(body.lead_department_id || "").trim();
    const owner = String(body.assignee_user_id || "").trim();
    if (!dept || !owner) return NextResponse.json({ error: "Cần chọn khoa/phòng và người phụ trách countdown." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(COUNTDOWN_RPC, {
      p_inspection_record_id: recordId,
      p_lead_department_id: dept,
      p_assignee_user_id: owner,
      p_actor_user_id: auth.user.id,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể tạo countdown tiếp đoàn.");
      return NextResponse.json({ error: txMessage }, { status: /duplicate|not active|countdown|invalid|required|not found/i.test(txMessage) ? 409 : 400 });
    }
    const created = typeof tx === "object" && tx && "created_actions" in tx ? Number((tx as Record<string, unknown>).created_actions || 0) : 0;
    return NextResponse.json({
      ok: true,
      status: "PREPARATION",
      transaction: "atomic",
      result: tx,
      message: created ? `Đã tạo ${created} Action countdown.` : "Các mốc countdown đã tồn tại; không tạo trùng.",
    });
  } else if (command === "START_VISIT" || command === "COMPLETE_VISIT") {
    if (command === "COMPLETE_VISIT" && !reason) {
      return NextResponse.json({ error: "Tóm tắt kết quả/kiến nghị ban đầu là bắt buộc." }, { status: 400 });
    }
    const { data: tx, error: txError } = await admin.rpc(TRANSITION_RPC, {
      p_inspection_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_command: command,
      p_reason: reason,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể cập nhật trạng thái tiếp đoàn.");
      return NextResponse.json(
        { error: txMessage },
        { status: /không|chưa|cần|trạng thái|ngày đoàn|ngoài phạm vi/i.test(txMessage) ? 409 : 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      status: tx?.workflow_status,
      message: command === "START_VISIT"
        ? "Đã chuyển sang chế độ đoàn đang làm việc."
        : "Đã chuyển sang theo dõi sau đoàn.",
      transaction: "atomic",
      result: tx,
    });
  } else if (command === "CLOSE") {
    if (oldStatus !== "FOLLOW_UP") return NextResponse.json({ error: "Đợt kiểm tra chưa ở giai đoạn theo dõi sau đoàn." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Cần kết luận trước khi đóng đợt tiếp đoàn." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(CLOSE_RPC, {
      p_inspection_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể đóng đợt tiếp đoàn.");
      return NextResponse.json({ error: txMessage }, { status: /not active|follow_up|incomplete|evidence|required|not found/i.test(txMessage) ? 409 : 400 });
    }
    return NextResponse.json({
      ok: true,
      status: "CLOSED",
      message: "Đã đóng đợt tiếp đoàn; hồ sơ và tồn tại vẫn được giữ để truy vết.",
      transaction: "atomic",
      result: tx,
    });
  } else {
    return NextResponse.json({ error: "Thao tác Inspection Mode không hợp lệ." }, { status: 400 });
  }

}
