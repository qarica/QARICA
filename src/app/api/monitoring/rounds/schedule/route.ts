import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const SCHEDULE_RPC = "qlcl_monitoring_schedule_v1";

export async function POST(request: Request) {
  const auth = await requireApiPermission("monitoring.perform");
  if (!auth.ok) return auth.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu tạo đợt giám sát không hợp lệ." }, { status: 400 });
  }

  const versionId = String(body.version_id || "").trim();
  const scheduledDate = String(body.scheduled_date || "").trim();
  if (!versionId) return NextResponse.json({ error: "Thiếu phiên bản bảng kiểm." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) return NextResponse.json({ error: "Ngày giám sát không hợp lệ." }, { status: 400 });

  const admin = createAdminClient();
  const { data: tx, error } = await admin.rpc(SCHEDULE_RPC, {
    p_version_id: versionId,
    p_scheduled_date: scheduledDate,
    p_actor_user_id: auth.user.id,
  });

  if (error) {
    const message = rpcErrorMessage(error, "Không tạo được đợt giám sát.");
    const status =
      /not active|outside current organization|owner department/i.test(message) ? 403 :
      /must be published|invalid|missing/i.test(message) ? 409 :
      400;
    return NextResponse.json({ error: message }, { status });
  }

  const result = tx && typeof tx === "object" ? tx as Record<string, unknown> : {};
  const roundId = typeof result.round_id === "string" ? result.round_id : null;
  const recordCode = typeof result.record_code === "string" ? result.record_code : null;
  const status = typeof result.status === "string" ? result.status : null;

  if (!roundId || !recordCode || status !== "SCHEDULED") {
    return NextResponse.json({ error: "Kết quả tạo đợt giám sát không hợp lệ." }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    round_id: roundId,
    record_code: recordCode,
    status,
    transaction: "atomic",
  });
}
