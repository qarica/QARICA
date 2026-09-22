import { NextResponse } from "next/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const WORKFLOW_RPC = "qlcl_indicator_measurement_transition_v1";

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { id: recordId } = await params;
  const body: any = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const permission = command === "SAVE" || command === "SUBMIT" ? "indicators.enter" : "indicators.verify";

  if (!["SAVE", "SUBMIT", "VERIFY", "RETURN", "LOCK"].includes(command)) {
    return NextResponse.json({ error: "Thao tác chỉ số không hợp lệ." }, { status: 400 });
  }

  const [{ data: allowed }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: permission }),
    supabase.rpc("has_permission", { p_permission_code: "indicators.manage" }),
  ]);
  if (!allowed && !canManage) {
    return NextResponse.json({ error: "Bạn chưa có quyền thực hiện bước này." }, { status: 403 });
  }

  const numerator = numberOrNull(body.numerator_value);
  const denominator = numberOrNull(body.denominator_value);
  const raw = numberOrNull(body.raw_value);
  const comment = String(body.comment || "").trim() || null;
  const now = new Date().toISOString();

  const admin = createAdminClient();
  const { data: tx, error } = await admin.rpc(WORKFLOW_RPC, {
    p_record_id: recordId,
    p_actor_user_id: auth.user.id,
    p_action: command,
    p_numerator: numerator,
    p_denominator: denominator,
    p_raw: raw,
    p_comment: comment,
    p_at: now,
  });

  if (error) {
    const message = rpcErrorMessage(error, "Không thể cập nhật kỳ đo chỉ số.");
    const status =
      /outside current organization|not active/i.test(message) ? 403 :
      /only draft|only returned|only submitted|only verified|required|unsupported|cannot be negative|positive denominator|not found|target_range/i.test(message) ? 409 :
      400;
    return NextResponse.json({ error: message }, { status });
  }

  const result = tx && typeof tx === "object" ? tx as Record<string, unknown> : {};
  const status = typeof result.status === "string" ? result.status : null;
  if (!status) return NextResponse.json({ error: "Trạng thái kỳ đo sau xử lý không hợp lệ." }, { status: 409 });

  const message =
    command === "RETURN" ? "Đã trả dữ liệu về người nhập." :
    command === "LOCK" ? "Đã khóa kỳ đo." :
    command === "VERIFY" ? "Đã xác minh dữ liệu." :
    command === "SUBMIT" ? "Đã gửi dữ liệu để xác minh." :
    "Đã lưu dữ liệu và tính lại kết quả.";

  return NextResponse.json({
    ok: true,
    status,
    calculated_value: result.calculated_value ?? null,
    result_level: result.result_level ?? null,
    message,
    transaction: "atomic",
  });
}
