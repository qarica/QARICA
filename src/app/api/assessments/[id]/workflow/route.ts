import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const TRANSITION_RPC = "qlcl_transition_assessment_round_v1";
const FINALIZE_RPC = "qlcl_finalize_assessment_round_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const [{ data: manage }, { data: review }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "criteria.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "criteria.review" }),
  ]);
  if (!manage && !review) return NextResponse.json({ error: "Bạn chưa có quyền xử lý đợt tự đánh giá." }, { status: 403 });

  const { id: recordId } = await params;
  const body: any = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const reason = String(body.comment || "").trim() || null;
  const admin: any = createAdminClient();

  const [{ data: caller }, { data: record }, { data: round }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("records").select("id,organization_id,lifecycle_status").eq("id", recordId).eq("record_type", "ASSESSMENT").maybeSingle(),
    admin.from("assessment_rounds").select("id,workflow_status").eq("record_id", recordId).maybeSingle(),
  ]);

  if (!caller?.is_active || !caller.organization_id || !record || record.organization_id !== caller.organization_id) {
    return NextResponse.json({ error: "Không tìm thấy đợt tự đánh giá trong phạm vi đơn vị hiện tại." }, { status: 404 });
  }
  if (record.lifecycle_status !== "ACTIVE") {
    return NextResponse.json({ error: "Đợt tự đánh giá đã đóng hoặc không còn ở trạng thái hoạt động." }, { status: 409 });
  }
  if (!round) return NextResponse.json({ error: "Không tìm thấy dữ liệu đợt đánh giá." }, { status: 404 });

  if (command === "START" || command === "SUBMIT_REVIEW") {
    const { data: tx, error } = await admin.rpc(TRANSITION_RPC, {
      p_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_command: command,
      p_reason: reason,
    });
    if (error) {
      const message = rpcErrorMessage(error, command === "START"
        ? "Không thể mở đợt tự đánh giá."
        : "Không thể chuyển đợt sang rà soát.");
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      status: tx?.workflow_status ?? (command === "START" ? "IN_PROGRESS" : "REVIEWING"),
      message: command === "START"
        ? "Đã mở đợt tự đánh giá."
        : "Đã chuyển đợt sang kiểm tra chéo/rà soát.",
      gate: tx ?? null,
      transaction: "atomic",
    });
  }

  if (command === "FINALIZE") {
    if (!manage || String(round.workflow_status) !== "REVIEWING") {
      return NextResponse.json({ error: "Đợt chưa đủ điều kiện hoặc bạn không có quyền chốt." }, { status: 409 });
    }
    if (!reason) return NextResponse.json({ error: "Kết luận chốt đợt là bắt buộc." }, { status: 400 });

    const { data: finalized, error } = await admin.rpc(FINALIZE_RPC, {
      p_round_id: round.id,
      p_record_id: recordId,
      p_organization_id: caller.organization_id,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });
    if (error) {
      const message = rpcErrorMessage(error, "Không thể chốt đợt tự đánh giá.");
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      status: "FINALIZED",
      message: "Đã chốt đợt tự đánh giá; lịch sử điểm được giữ nguyên.",
      gate: finalized || null,
      transaction: "atomic",
    });
  }

  return NextResponse.json({ error: "Thao tác tự đánh giá không hợp lệ." }, { status: 400 });
}
