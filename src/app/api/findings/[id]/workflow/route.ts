import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { findingSubmitGate } from "@/lib/quality-gates";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const REVIEW_ACTIONS = new Set(["ACCEPT", "RETURN", "ESCALATE_CAPA"]);
const CAPA_PRIORITIES = new Set(["NORMAL", "HIGH", "URGENT", "CRITICAL"]);
const ACCEPT_RPC = "qlcl_accept_and_close_finding_v1";
const RETURN_RPC = "qlcl_return_finding_v1";
const ESCALATE_RPC = "qlcl_escalate_finding_to_capa_v1";

async function hasPermission(supabase: Awaited<ReturnType<typeof createClient>>, code: string) {
  const { data } = await supabase.rpc("has_permission", { p_permission_code: code });
  return data === true;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const actorUserId = user.id;

  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  if (!command) return NextResponse.json({ error: "Thiếu thao tác xử lý Finding." }, { status: 400 });

  const { data: visibleRecord } = await supabase
    .from("records")
    .select("id,organization_id,record_code,title,lifecycle_status,work_year,owner_department_id,owner_user_id")
    .eq("id", recordId)
    .eq("record_type", "FINDING")
    .maybeSingle();

  if (!visibleRecord) return NextResponse.json({ error: "Không tìm thấy Finding hoặc bạn không có quyền truy cập." }, { status: 404 });
  if (visibleRecord.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Finding không còn ở trạng thái hoạt động." }, { status: 409 });
  const recordCode = visibleRecord.record_code;
  const recordTitle = visibleRecord.title;

  const admin = createAdminClient();
  const { data: finding } = await admin
    .from("findings")
    .select("id,record_id,description,severity,lead_department_id,owner_user_id,due_date,immediate_action,workflow_status")
    .eq("record_id", recordId)
    .maybeSingle();

  if (!finding) return NextResponse.json({ error: "Không tìm thấy dữ liệu Finding." }, { status: 404 });

  const findingId = finding.id;
  const findingOwnerUserId = finding.owner_user_id;
  const canManage = await hasPermission(supabase, "findings.manage");
  const canOperate = canManage || finding.owner_user_id === actorUserId || visibleRecord.owner_user_id === actorUserId;
  if (!canOperate) return NextResponse.json({ error: "Bạn không phải người phụ trách Finding này." }, { status: 403 });
  if (REVIEW_ACTIONS.has(command) && !canManage) {
    return NextResponse.json({ error: "Chỉ người có quyền quản lý Finding mới được xác minh kết quả." }, { status: 403 });
  }

  const oldStatus = String(finding.workflow_status || "OPEN");
  const now = new Date().toISOString();
  const reason = String(body.comment || "").trim() || null;

  async function notifyReview(action: "RETURN" | "ACCEPT" | "ESCALATE_CAPA") {
    const notifyUser = findingOwnerUserId;
    if (!notifyUser || notifyUser === actorUserId) return;
    await admin.from("notifications").upsert({
      recipient_user_id: notifyUser,
      notification_type: `FINDING_${action}`,
      priority: action === "RETURN" ? "HIGH" : "NORMAL",
      title: action === "RETURN"
        ? "Finding được trả lại bổ sung"
        : action === "ACCEPT"
          ? "Finding đã được xác nhận đóng"
          : "Finding đã chuyển sang CAPA",
      message: `${recordCode} · ${recordTitle}`,
      target_record_id: recordId,
      target_route: `/findings/${recordId}`,
      notification_event_key: `finding:${action}:${findingId}:${notifyUser}:${oldStatus}`,
      is_read: false,
    }, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true });
  }

  if (command === "ACCEPT") {
    if (oldStatus !== "VERIFYING") return NextResponse.json({ error: "Finding chưa ở bước xác minh." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Nhận xét xác minh là bắt buộc." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(ACCEPT_RPC, {
      p_finding_record_id: recordId,
      p_actor_user_id: actorUserId,
      p_reason: reason,
    });
    if (txError) {
      const message = rpcErrorMessage(txError, "Không thể xác nhận đóng Finding.");
      return NextResponse.json({ error: message }, { status: /not active|must be verifying|not found/i.test(message) ? 409 : 400 });
    }
    await notifyReview("ACCEPT");
    return NextResponse.json({ ok: true, status: "CLOSED", transaction: "atomic", result: tx });
  }

  if (command === "RETURN") {
    if (oldStatus !== "VERIFYING") return NextResponse.json({ error: "Finding chưa ở bước xác minh." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Nhận xét xác minh là bắt buộc." }, { status: 400 });
    const nextDueDate = String(body.next_due_date || "").trim();
    if (!nextDueDate) return NextResponse.json({ error: "Cần xác định hạn bổ sung tiếp theo." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(RETURN_RPC, {
      p_finding_record_id: recordId,
      p_actor_user_id: actorUserId,
      p_next_due_date: nextDueDate,
      p_reason: reason,
    });
    if (txError) {
      const message = rpcErrorMessage(txError, "Không thể trả Finding để bổ sung.");
      return NextResponse.json({ error: message }, { status: /not active|xác minh|not found|trạng thái/i.test(message) ? 409 : 400 });
    }
    await notifyReview("RETURN");
    return NextResponse.json({ ok: true, status: "RETURNED", transaction: "atomic", result: tx });
  }

  if (command === "ESCALATE_CAPA") {
    if (oldStatus !== "VERIFYING") return NextResponse.json({ error: "Finding chưa ở bước xác minh." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Nhận xét xác minh là bắt buộc." }, { status: 400 });

    const capaPriority = String(body.capa_priority || "HIGH").toUpperCase();
    if (!CAPA_PRIORITIES.has(capaPriority)) return NextResponse.json({ error: "Mức ưu tiên CAPA không hợp lệ." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(ESCALATE_RPC, {
      p_finding_record_id: recordId,
      p_actor_user_id: actorUserId,
      p_priority: capaPriority,
      p_reason: reason,
    });
    if (txError) {
      const message = rpcErrorMessage(txError, "Không thể chuyển Finding sang CAPA.");
      return NextResponse.json({ error: message }, { status: /already|duplicate|not active|must be verifying|not found/i.test(message) ? 409 : 400 });
    }
    await notifyReview("ESCALATE_CAPA");
    return NextResponse.json({ ok: true, status: "ESCALATED_TO_CAPA", transaction: "atomic", result: tx });
  }

  let newStatus = oldStatus;
  let auditReason = reason;

  if (command === "START") {
    if (!["OPEN", "ASSIGNED"].includes(oldStatus)) {
      return NextResponse.json({ error: "Finding không ở trạng thái có thể bắt đầu xử lý." }, { status: 409 });
    }
    newStatus = "IN_PROGRESS";
  } else if (command === "SUBMIT") {
    if (!["OPEN", "ASSIGNED", "IN_PROGRESS", "RETURNED"].includes(oldStatus)) {
      return NextResponse.json({ error: "Finding không ở trạng thái có thể gửi xác minh." }, { status: 409 });
    }
    const { data: links } = await admin.from("finding_action_links").select("action_id").eq("finding_id", findingId);
    const actionIds = (links ?? []).map((row: any) => row.action_id).filter(Boolean);
    const { data: linkedActions } = actionIds.length
      ? await admin.from("actions").select("id,workflow_status").in("id", actionIds)
      : { data: [] as any[] };
    const terminalActionStatuses = new Set(["COMPLETED", "CANCELLED", "NOT_APPLICABLE"]);
    const unfinished = (linkedActions ?? []).filter((row: any) => !terminalActionStatuses.has(String(row.workflow_status))).length;
    const { count } = await admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId);
    const gate = findingSubmitGate({ actionCount: actionIds.length, unfinishedActionCount: unfinished, evidenceCount: count ?? 0 });
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 409 });
    newStatus = "EVIDENCE_SUBMITTED";
    auditReason = auditReason || "Đã hoàn thành Action và nộp minh chứng; gửi Phòng QLCL xác minh.";
  } else if (command === "BEGIN_VERIFY") {
    if (!canManage) return NextResponse.json({ error: "Bạn không có quyền bắt đầu xác minh Finding." }, { status: 403 });
    if (oldStatus !== "EVIDENCE_SUBMITTED") {
      return NextResponse.json({ error: "Finding chưa ở trạng thái Đã nộp minh chứng." }, { status: 409 });
    }
    newStatus = "VERIFYING";
  } else {
    return NextResponse.json({ error: "Thao tác Finding không hợp lệ." }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from("findings")
    .update({ workflow_status: newStatus, updated_at: now })
    .eq("id", findingId)
    .eq("workflow_status", oldStatus);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: actorUserId,
    record_id: recordId,
    table_name: "findings",
    row_id: findingId,
    action_type: `FINDING_${command}`,
    old_value: { workflow_status: oldStatus, due_date: finding.due_date ?? null },
    new_value: { workflow_status: newStatus },
    reason: auditReason,
    request_meta: { source: "qlcl-ui", transaction: "direct" },
  });

  if (auditError) {
    return NextResponse.json({
      error: `Đã cập nhật trạng thái Finding nhưng chưa ghi được audit trail: ${auditError.message}`,
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: newStatus, transaction: "direct" });
}
