import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const CONFIRM_RPC = "qlcl_monitoring_confirm_v1";

function collectEvidenceIds(value: unknown, target: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectEvidenceIds(item, target));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key === "evidence_id" && typeof nested === "string" && nested) target.add(nested);
    else collectEvidenceIds(nested, target);
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("checklists.manage");
  if (!auth.ok) return auth.response;

  const { id: roundId } = await params;
  const admin = createAdminClient();
  const [{ data: caller }, { data: round }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active,full_name").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("monitoring_rounds").select("id,record_id,workflow_status,lead_assessor_id").eq("id", roundId).maybeSingle(),
  ]);

  if (!caller?.organization_id || !caller.is_active) return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 403 });
  if (!round) return NextResponse.json({ error: "Không tìm thấy đợt giám sát." }, { status: 404 });
  if (round.workflow_status !== "AWAITING_CONFIRMATION") return NextResponse.json({ error: "Đợt giám sát không ở trạng thái Chờ xác nhận." }, { status: 409 });

  const { data: record } = await admin.from("records").select("id,organization_id").eq("id", round.record_id).maybeSingle();
  if (!record || record.organization_id !== caller.organization_id) return NextResponse.json({ error: "Đợt giám sát không thuộc bệnh viện hiện tại." }, { status: 403 });

  const { data: responses, error: responseError } = await admin
    .from("checklist_responses")
    .select("id,answer_value,created_at")
    .eq("monitoring_round_id", roundId)
    .order("created_at", { ascending: true });
  if (responseError || !responses?.length) return NextResponse.json({ error: responseError?.message || "Không tìm thấy dữ liệu bảng kiểm để xác nhận." }, { status: 400 });

  const confirmedAt = new Date().toISOString();
  const confirmation = { user_id: auth.user.id, full_name: caller.full_name || null, confirmed_at: confirmedAt };
  let transaction: "atomic" | "legacy-fallback" = "atomic";

  const { data: tx, error: txError } = await admin.rpc(CONFIRM_RPC, {
    p_round_id: roundId,
    p_actor_user_id: auth.user.id,
    p_full_name: caller.full_name || null,
    p_confirmed_at: confirmedAt,
  });

  if (txError) {
    if (!isMissingRpcFunction(txError, CONFIRM_RPC)) {
      const txMessage = rpcErrorMessage(txError, "Không thể xác nhận đợt giám sát.");
      return NextResponse.json({ error: txMessage }, { status: /awaiting_confirmation|required|not found/i.test(txMessage) ? 409 : 400 });
    }

    transaction = "legacy-fallback";
    const firstResponse = responses[0];
    const answerValue = typeof firstResponse.answer_value === "object" && firstResponse.answer_value !== null ? firstResponse.answer_value as Record<string, unknown> : {};
    const { error: markerError } = await admin.from("checklist_responses").update({ answer_value: { ...answerValue, qlcl_confirmation: confirmation } }).eq("id", firstResponse.id);
    if (markerError) return NextResponse.json({ error: markerError.message }, { status: 400 });

    const { data: updated, error: roundError } = await admin.from("monitoring_rounds").update({ workflow_status: "CONFIRMED" }).eq("id", roundId).eq("workflow_status", "AWAITING_CONFIRMATION").select("id,workflow_status").maybeSingle();
    if (roundError || !updated) {
      await admin.from("checklist_responses").update({ answer_value: answerValue }).eq("id", firstResponse.id);
      return NextResponse.json({ error: roundError?.message || "Không thể xác nhận đợt giám sát." }, { status: 400 });
    }
  }

  // Validation of storage evidence is intentionally supplemental. Core confirmation above is atomic.
  const evidenceIds = new Set<string>();
  for (const response of responses) collectEvidenceIds(response.answer_value, evidenceIds);
  let evidenceValidated = 0;
  if (evidenceIds.size) {
    const { data: validated } = await admin.from("evidence").update({ validity_status: "VALID" }).in("id", Array.from(evidenceIds)).eq("organization_id", caller.organization_id).select("id");
    evidenceValidated = validated?.length ?? 0;
  }

  return NextResponse.json({ ok: true, status: "CONFIRMED", confirmation, evidence_validated: evidenceValidated, transaction, result: tx ?? null });
}
