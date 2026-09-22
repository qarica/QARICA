import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const CLOSE_RPC = "qlcl_close_audit_v1";
const CREATE_FINDING_RPC = "qlcl_audit_create_finding_v1";
const TRANSITION_RPC = "qlcl_audit_transition_v1";

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

  if (cmd === "CREATE_FINDING") {
    if (!["IN_PROGRESS", "DRAFT_REPORT", "REPORT_REVIEW", "FOLLOW_UP"].includes(old)) {
      return NextResponse.json({ error: "Audit chưa ở giai đoạn được ghi nhận Finding." }, { status: 409 });
    }
    const sourceRef = String(b.source_ref || "").trim();
    const description = String(b.description || "").trim();
    const severity = String(b.severity || "").trim().toUpperCase();
    const dueDate = String(b.due_date || "").trim();
    const leadDepartmentId = String(b.lead_department_id || "").trim();
    const ownerUserId = String(b.owner_user_id || "").trim();
    if (!sourceRef || !description || !dueDate || !leadDepartmentId || !ownerUserId) {
      return NextResponse.json({ error: "Cần đủ mã phát hiện, mô tả, khoa/phòng, người phụ trách và hạn khắc phục." }, { status: 400 });
    }
    if (!["MINOR", "MAJOR", "CRITICAL"].includes(severity)) {
      return NextResponse.json({ error: "Mức độ Finding không hợp lệ." }, { status: 400 });
    }
    const { data: tx, error: txError } = await a.rpc(CREATE_FINDING_RPC, {
      p_audit_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_source_ref: sourceRef,
      p_description: description,
      p_severity: severity,
      p_due_date: dueDate,
      p_lead_department_id: leadDepartmentId,
      p_owner_user_id: ownerUserId,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể tạo Finding từ Audit.");
      return NextResponse.json({ error: txMessage }, { status: /already|duplicate|outside|not active|status|invalid/i.test(txMessage) ? 409 : 400 });
    }
    const findingCode = tx && typeof tx === "object" && "finding_code" in tx ? String((tx as Record<string, unknown>).finding_code || "") : "";
    const alreadyExists = !!(tx && typeof tx === "object" && "already_exists" in tx && (tx as Record<string, unknown>).already_exists);
    return NextResponse.json({
      ok: true,
      transaction: "atomic",
      result: tx,
      message: alreadyExists ? "Finding này đã tồn tại; QARICA mở lại liên kết hiện có thay vì tạo trùng." : findingCode ? `Đã tạo Finding ${findingCode} từ Audit và giao người phụ trách.` : "Đã tạo Finding từ Audit và giữ liên kết truy vết.",
    });
  } else if (cmd === "START") {
    if (old !== "DRAFT" || !scopes) return NextResponse.json({ error: "Cần phạm vi Audit trước khi bắt đầu." }, { status: 409 });
    next = "IN_PROGRESS";
    message = "Đã bắt đầu Audit/Tracer.";
  } else if (cmd === "SUBMIT_REPORT") {
    if (old !== "IN_PROGRESS" || !sessions || !evidence) return NextResponse.json({ error: "Cần phiên thực hiện và bằng chứng Audit trước khi gửi báo cáo." }, { status: 409 });
    next = "DRAFT_REPORT";
    message = "Đã gửi báo cáo Audit để rà soát.";
  } else if (cmd === "START_FOLLOW_UP") {
    if (!["DRAFT_REPORT", "REPORT_REVIEW"].includes(old)) return NextResponse.json({ error: "Báo cáo Audit chưa ở bước rà soát." }, { status: 409 });
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

  const { data: tx, error: txError } = await a.rpc(TRANSITION_RPC, {
    p_audit_record_id: recordId,
    p_actor_user_id: auth.user.id,
    p_action: cmd,
    p_at: now,
  });
  if (txError) {
    if (isMissingRpcFunction(txError, TRANSITION_RPC)) {
      return NextResponse.json({ error: "Chức năng chuyển trạng thái Audit chưa sẵn sàng trên cơ sở dữ liệu." }, { status: 503 });
    }
    const txMessage = rpcErrorMessage(txError, "Không thể chuyển trạng thái Audit.");
    return NextResponse.json({ error: txMessage }, { status: /required|must be|outside current organization|not active|not found|under review|unsupported/i.test(txMessage) ? 409 : 400 });
  }

  const result = tx && typeof tx === "object" ? tx as Record<string, unknown> : {};
  const persistedStatus = typeof result.status === "string" ? result.status : null;
  if (!persistedStatus || persistedStatus !== next) {
    return NextResponse.json({ error: "Trạng thái Audit sau giao dịch không hợp lệ." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, status: persistedStatus, message, transaction: "atomic", result: tx });
}
