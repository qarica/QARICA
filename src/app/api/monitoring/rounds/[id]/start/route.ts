import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const START_RPC = "qlcl_monitoring_start_v1";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("monitoring.perform");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const admin = createAdminClient();
  const startedAt = new Date().toISOString();

  const { data: tx, error } = await admin.rpc(START_RPC, {
    p_round_id: id,
    p_actor_user_id: auth.user.id,
    p_started_at: startedAt,
  });

  if (error) {
    const message = rpcErrorMessage(error, "Không thể bắt đầu đợt giám sát.");
    const status =
      /not active|outside current organization/i.test(message) ? 403 :
      /not found/i.test(message) ? 404 :
      /must be scheduled|required/i.test(message) ? 409 :
      400;
    return NextResponse.json({ error: message }, { status });
  }

  const result = tx && typeof tx === "object" ? tx as Record<string, unknown> : {};
  const status = typeof result.status === "string" ? result.status : null;
  const persistedStartedAt = typeof result.started_at === "string" ? result.started_at : startedAt;
  if (status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Trạng thái bắt đầu giám sát không hợp lệ." }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    status,
    started_at: persistedStartedAt,
    transaction: "atomic",
  });
}
