import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const CLOSE_RPC = "qlcl_close_audit_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await createClient();
  const { data: auth } = await s.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: allowed } = await s.rpc("has_permission", { p_permission_code: "audit.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền quản lý Audit/Tracer." }, { status: 403 });

  const { id: recordId } = await params;
  const b: any = await request.json().catch(() => ({}));
  const cmd = String(b.action || "").toUpperCase();
  const { data: record } = await s.from("records").select("id,lifecycle_status").eq("id", recordId).eq("record_type", "AUDIT").maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy hồ sơ Audit/Tracer." }, { status: 404 });

  const a: any = createAdminClient();
  const { data: audit } = await a.from("audits").select("id,workflow_status").eq("record_id", recordId).maybeSingle();
  if (!audit) return NextResponse.json({ error: "Không tìm thấy dữ liệu Audit." }, { status: 404 });
  const old = String(audit.workflow_status || "DRAFT");
  const now = new Date().toISOString();
  const reason = String(b.comment || "").trim() || null;
  let next = old;
  let message = "Đã cập nhật Audit.";

  const [{ count: scopes }, { count: sessions }, { data: flinks }, { count: evidence }] = await Promise.all([
    a.from("audit_scopes").select("id", { count: "exact", head: true }).eq("audit_id", audit.id),
    a.from("audit_sessions").select("id", { count: "exact", head: true }).eq("audit_id", audit.id),
    a.from("audit_finding_links").select("finding_id").eq("audit_id", audit.id),
    a.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId),
  ]);

  if (cmd === "START") {
    if (old !== "DRAFT" || !scopes) return NextResponse.json({ error: "Cần phạm vi Audit trước khi bắt đầu." }, { status: 409 });
    next = "IN_PROGRESS";
    message = "Đã bắt đầu Audit/Tracer.";
  } else if (cmd === "SUBMIT_REPORT") {
    if (old !== "IN_PROGRESS" || !sessions || !evidence) return NextResponse.json({ error: "Cần phiên thực hiện và bằng chứng Audit trước khi gửi báo cáo." }, { status: 409 });
    next = "REPORT_REVIEW";
    message = "Đã gửi báo cáo Audit để rà soát.";
  } else if (cmd === "START_FOLLOW_UP") {
    if (old !== "REPORT_REVIEW") return NextResponse.json({ error: "Báo cáo Audit chưa ở bước rà soát." }, { status: 409 });
    next = "FOLLOW_UP";
    message = "Đã chuyển theo dõi Finding sau Audit.";
  } else if (cmd === "CLOSE") {
    if (old !== "FOLLOW_UP" || !reason) return NextResponse.json({ error: "Cần hoàn tất theo dõi và ghi kết luận đóng." }, { status: 409 });
    const ids = (flinks || []).map((x: any) => x.finding_id).filter(Boolean);
    const { data: findings } = ids.length ? await a.from("findings").select("workflow_status").in("id", ids) : { data: [] };
    const open = (findings || []).filter((x: any) => !["CLOSED", "CANCELLED"].includes(String(x.workflow_status))).length;
    if (open) return NextResponse.json({ error: `Còn ${open} Finding chưa đóng/recheck.` }, { status: 409 });

    const { data: tx, error: txError } = await a.rpc(CLOSE_RPC, {
      p_audit_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });
    if (!txError) return NextResponse.json({ ok: true, status: "CLOSED", message: "Đã đóng Audit sau khi theo dõi Finding.", transaction: "atomic", result: tx });
    if (!isMissingRpcFunction(txError, CLOSE_RPC)) {
      const txMessage = rpcErrorMessage(txError, "Không thể đóng Audit.");
      return NextResponse.json({ error: txMessage }, { status: /not active|must be follow_up|open finding|not found/i.test(txMessage) ? 409 : 400 });
    }

    next = "CLOSED";
    const { error: recordError } = await a.from("records").update({ lifecycle_status: "CLOSED", closed_at: now, updated_at: now }).eq("id", recordId);
    if (recordError) return NextResponse.json({ error: recordError.message }, { status: 400 });
    const { error: auditError } = await a.from("audits").update({ workflow_status: next, closed_at: now, updated_at: now }).eq("id", audit.id);
    if (auditError) {
      await a.from("records").update({ lifecycle_status: record.lifecycle_status, closed_at: null, updated_at: now }).eq("id", recordId);
      return NextResponse.json({ error: auditError.message }, { status: 400 });
    }
    await a.from("record_status_history").insert({ record_id: recordId, old_status: record.lifecycle_status, new_status: "CLOSED", changed_by: auth.user.id, reason });
    await a.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "audits", row_id: audit.id, action_type: "AUDIT_CLOSE", old_value: { workflow_status: old }, new_value: { workflow_status: next }, reason, request_meta: { source: "qlcl-ui", transaction: "legacy-fallback" } });
    return NextResponse.json({ ok: true, status: next, message: "Đã đóng Audit sau khi theo dõi Finding.", transaction: "legacy-fallback" });
  } else return NextResponse.json({ error: "Thao tác Audit không hợp lệ." }, { status: 400 });

  const update: any = { workflow_status: next, updated_at: now };
  if (cmd === "SUBMIT_REPORT") update.report_finalized_at = now;
  const { error: updateError } = await a.from("audits").update(update).eq("id", audit.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  await a.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "audits", row_id: audit.id, action_type: `AUDIT_${cmd}`, old_value: { workflow_status: old }, new_value: { workflow_status: next }, reason, request_meta: { source: "qlcl-ui" } });
  return NextResponse.json({ ok: true, status: next, message, transaction: "direct" });
}
