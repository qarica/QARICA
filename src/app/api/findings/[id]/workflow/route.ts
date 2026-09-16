import { NextResponse } from "next/server";
import { findingRecordRollbackPatch, findingRollbackPatch } from "@/lib/finding-workflow-rollback";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { findingSubmitGate } from "@/lib/quality-gates";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const REVIEW_ACTIONS = new Set(["ACCEPT", "RETURN", "ESCALATE_CAPA"]);
const CAPA_PRIORITIES = new Set(["NORMAL", "HIGH", "URGENT", "CRITICAL"]);
const ACCEPT_RPC = "qlcl_accept_and_close_finding_v1";
const ESCALATE_RPC = "qlcl_escalate_finding_to_capa_v1";

async function hasPermission(supabase: Awaited<ReturnType<typeof createClient>>, code: string) {
  const { data } = await supabase.rpc("has_permission", { p_permission_code: code });
  return data === true;
}

function rollbackMessage(message: string, errors: string[]) {
  return errors.length ? `${message} Rollback chưa hoàn tất: ${errors.join("; ")}` : message;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  if (!command) return NextResponse.json({ error: "Thiếu thao tác xử lý Finding." }, { status: 400 });

  const { data: visibleRecord } = await supabase
    .from("records")
    .select("id,organization_id,record_code,title,lifecycle_status,work_year,owner_department_id,owner_user_id,closed_at,updated_at")
    .eq("id", recordId)
    .eq("record_type", "FINDING")
    .maybeSingle();
  if (!visibleRecord) return NextResponse.json({ error: "Không tìm thấy Finding hoặc bạn không có quyền truy cập." }, { status: 404 });
  if (visibleRecord.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Finding không còn ở trạng thái hoạt động." }, { status: 409 });

  const admin = createAdminClient();
  const { data: finding } = await admin
    .from("findings")
    .select("id,record_id,description,severity,lead_department_id,owner_user_id,due_date,immediate_action,workflow_status,confirmed_by,confirmed_at,updated_at")
    .eq("record_id", recordId)
    .maybeSingle();
  if (!finding) return NextResponse.json({ error: "Không tìm thấy dữ liệu Finding." }, { status: 404 });
  const canManage = await hasPermission(supabase, "findings.manage");
  const canOperate = canManage || finding.owner_user_id === user.id || visibleRecord.owner_user_id === user.id;
  if (!canOperate) return NextResponse.json({ error: "Bạn không phải người phụ trách Finding này." }, { status: 403 });
  if (REVIEW_ACTIONS.has(command) && !canManage) return NextResponse.json({ error: "Chỉ người có quyền quản lý Finding mới được xác minh kết quả." }, { status: 403 });

  const oldStatus = String(finding.workflow_status || "OPEN");
  const findingRollback = findingRollbackPatch(finding);
  const recordRollback = findingRecordRollbackPatch(visibleRecord);
  const now = new Date().toISOString();
  let newStatus = oldStatus;
  let reason = String(body.comment || "").trim() || null;
  let transaction: "direct" | "legacy-fallback" = "direct";
  let findingChanged = false;
  let recordChanged = false;
  let verificationId: string | null = null;
  let historyId: string | null = null;
  let generatedCapaRecordId: string | null = null;
  let generatedCapaId: string | null = null;
  let auditDetails: Record<string, unknown> = {};

  async function rollbackLegacyChanges() {
    const errors: string[] = [];
    if (generatedCapaRecordId) {
      const { error: linkRollbackError } = await admin.from("record_links").delete().eq("source_record_id", recordId).eq("target_record_id", generatedCapaRecordId).eq("relation_type", "ESCALATED_TO_CAPA");
      if (linkRollbackError) errors.push(`CAPA link: ${linkRollbackError.message}`);
    }
    if (generatedCapaId) {
      const { error: capaRollbackError } = await admin.from("capas").delete().eq("id", generatedCapaId);
      if (capaRollbackError) errors.push(`CAPA row: ${capaRollbackError.message}`);
    }
    if (generatedCapaRecordId) {
      const { error: capaRecordRollbackError } = await admin.from("records").update({ lifecycle_status: "ARCHIVED", updated_at: now }).eq("id", generatedCapaRecordId);
      if (capaRecordRollbackError) errors.push(`CAPA registry: ${capaRecordRollbackError.message}`);
    }
    if (historyId) {
      const { error: historyRollbackError } = await admin.from("record_status_history").delete().eq("id", historyId);
      if (historyRollbackError) errors.push(`history: ${historyRollbackError.message}`);
    }
    if (recordChanged) {
      const { error: recordRollbackError } = await admin.from("records").update(recordRollback).eq("id", recordId);
      if (recordRollbackError) errors.push(`record: ${recordRollbackError.message}`);
    }
    if (findingChanged) {
      const { error: findingRollbackError } = await admin.from("findings").update(findingRollback).eq("id", finding.id);
      if (findingRollbackError) errors.push(`finding: ${findingRollbackError.message}`);
    }
    if (verificationId) {
      const { error: verificationRollbackError } = await admin.from("finding_verifications").delete().eq("id", verificationId);
      if (verificationRollbackError) errors.push(`verification: ${verificationRollbackError.message}`);
    }
    return errors;
  }

  if (command === "START") {
    if (!["OPEN", "ASSIGNED"].includes(oldStatus)) return NextResponse.json({ error: "Finding không ở trạng thái có thể bắt đầu xử lý." }, { status: 409 });
    newStatus = "IN_PROGRESS";
  } else if (command === "SUBMIT") {
    if (!["OPEN", "ASSIGNED", "IN_PROGRESS", "RETURNED"].includes(oldStatus)) return NextResponse.json({ error: "Finding không ở trạng thái có thể gửi xác minh." }, { status: 409 });
    const { data: links } = await admin.from("finding_action_links").select("action_id").eq("finding_id", finding.id);
    const actionIds = (links ?? []).map((row: any) => row.action_id).filter(Boolean);
    const { data: linkedActions } = actionIds.length ? await admin.from("actions").select("id,workflow_status").in("id", actionIds) : { data: [] as any[] };
    const unfinished = (linkedActions ?? []).filter((row: any) => row.workflow_status !== "COMPLETED").length;
    const { count } = await admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId);
    const gate = findingSubmitGate({ actionCount: actionIds.length, unfinishedActionCount: unfinished, evidenceCount: count ?? 0 });
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 409 });
    newStatus = "EVIDENCE_SUBMITTED";
    reason = reason || "Đã hoàn thành Action và nộp minh chứng; gửi Phòng QLCL xác minh.";
  } else if (command === "BEGIN_VERIFY") {
    if (!canManage) return NextResponse.json({ error: "Bạn không có quyền bắt đầu xác minh Finding." }, { status: 403 });
    if (oldStatus !== "EVIDENCE_SUBMITTED") return NextResponse.json({ error: "Finding chưa ở trạng thái Đã nộp minh chứng." }, { status: 409 });
    newStatus = "VERIFYING";
  } else if (REVIEW_ACTIONS.has(command)) {
    if (oldStatus !== "VERIFYING") return NextResponse.json({ error: "Finding chưa ở bước xác minh." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Nhận xét xác minh là bắt buộc." }, { status: 400 });

    if (command === "ACCEPT") {
      const { data: tx, error: txError } = await admin.rpc(ACCEPT_RPC, {
        p_finding_record_id: recordId,
        p_actor_user_id: user.id,
        p_reason: reason,
      });
      if (!txError) {
        const notifyUser = finding.owner_user_id;
        if (notifyUser && notifyUser !== user.id) await admin.from("notifications").upsert({ recipient_user_id: notifyUser, notification_type: "FINDING_ACCEPT", priority: "NORMAL", title: "Finding đã được xác nhận đóng", message: `${visibleRecord.record_code} · ${visibleRecord.title}`, target_record_id: recordId, target_route: `/findings/${recordId}`, notification_event_key: `finding:ACCEPT:${finding.id}:${notifyUser}:${oldStatus}`, is_read: false }, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true });
        return NextResponse.json({ ok: true, status: "CLOSED", transaction: "atomic", result: tx });
      }
      if (!isMissingRpcFunction(txError, ACCEPT_RPC)) {
        const message = rpcErrorMessage(txError, "Không thể xác nhận đóng Finding.");
        return NextResponse.json({ error: message }, { status: /not active|must be verifying|not found/i.test(message) ? 409 : 400 });
      }
      transaction = "legacy-fallback";
    }

    if (command === "ESCALATE_CAPA") {
      const capaPriority = String(body.capa_priority || "HIGH");
      if (!CAPA_PRIORITIES.has(capaPriority)) return NextResponse.json({ error: "Mức ưu tiên CAPA không hợp lệ." }, { status: 400 });
      const { data: existingCapaLink } = await admin.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "ESCALATED_TO_CAPA").maybeSingle();
      if (existingCapaLink?.target_record_id) return NextResponse.json({ error: "Finding này đã được chuyển sang CAPA; hệ thống chặn tạo CAPA trùng khi retry." }, { status: 409 });

      const { data: tx, error: txError } = await admin.rpc(ESCALATE_RPC, {
        p_finding_record_id: recordId,
        p_actor_user_id: user.id,
        p_priority: capaPriority,
        p_reason: reason,
      });
      if (!txError) {
        const notifyUser = finding.owner_user_id;
        if (notifyUser && notifyUser !== user.id) await admin.from("notifications").upsert({ recipient_user_id: notifyUser, notification_type: "FINDING_ESCALATE_CAPA", priority: "NORMAL", title: "Finding đã chuyển sang CAPA", message: `${visibleRecord.record_code} · ${visibleRecord.title}`, target_record_id: recordId, target_route: `/findings/${recordId}`, notification_event_key: `finding:ESCALATE_CAPA:${finding.id}:${notifyUser}:${oldStatus}`, is_read: false }, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true });
        return NextResponse.json({ ok: true, status: "ESCALATED_TO_CAPA", transaction: "atomic", result: tx });
      }
      if (!isMissingRpcFunction(txError, ESCALATE_RPC)) {
        const message = rpcErrorMessage(txError, "Không thể chuyển Finding sang CAPA.");
        return NextResponse.json({ error: message }, { status: /already|duplicate|not active|must be verifying/i.test(message) ? 409 : 400 });
      }
      transaction = "legacy-fallback";
    }

    const { data: latest } = await admin.from("finding_verifications").select("verification_no").eq("finding_id", finding.id).order("verification_no", { ascending: false }).limit(1).maybeSingle();
    const verificationNo = Number(latest?.verification_no || 0) + 1;
    const result = command === "ACCEPT" ? "ACCEPTED" : command === "RETURN" ? "RETURNED" : "ESCALATE_CAPA";
    const nextDueDate = command === "RETURN" ? String(body.next_due_date || "").trim() : null;
    if (command === "RETURN" && !nextDueDate) return NextResponse.json({ error: "Cần xác định hạn bổ sung tiếp theo." }, { status: 400 });
    const { data: verification, error: verificationError } = await admin.from("finding_verifications").insert({ finding_id: finding.id, verification_no: verificationNo, reviewer_user_id: user.id, result, comment: reason, next_due_date: nextDueDate || null }).select("id").single();
    if (verificationError || !verification) return NextResponse.json({ error: verificationError?.message || "Không lưu được kết quả xác minh Finding." }, { status: 400 });
    verificationId = String(verification.id);
    auditDetails = { verification_id: verificationId, verification_no: verificationNo };

    if (command === "ACCEPT") {
      newStatus = "CLOSED";
      const { error: findingError } = await admin.from("findings").update({ workflow_status: newStatus, confirmed_by: user.id, confirmed_at: now, updated_at: now }).eq("id", finding.id);
      if (findingError) {
        const rollbackErrors = await rollbackLegacyChanges();
        return NextResponse.json({ error: rollbackMessage(findingError.message, rollbackErrors) }, { status: 400 });
      }
      findingChanged = true;
      const { error: recordError } = await admin.from("records").update({ lifecycle_status: "CLOSED", closed_at: now, updated_at: now }).eq("id", recordId);
      if (recordError) {
        const rollbackErrors = await rollbackLegacyChanges();
        return NextResponse.json({ error: rollbackMessage(recordError.message, rollbackErrors) }, { status: 400 });
      }
      recordChanged = true;
      const { data: history, error: historyError } = await admin.from("record_status_history").insert({ record_id: recordId, old_status: visibleRecord.lifecycle_status, new_status: "CLOSED", changed_by: user.id, reason }).select("id").single();
      if (historyError || !history) {
        const rollbackErrors = await rollbackLegacyChanges();
        return NextResponse.json({ error: rollbackMessage(historyError?.message || "Không ghi được lịch sử trạng thái Finding.", rollbackErrors) }, { status: 400 });
      }
      historyId = String(history.id);
    } else if (command === "RETURN") {
      newStatus = "RETURNED";
      const { error: returnError } = await admin.from("findings").update({ workflow_status: newStatus, due_date: nextDueDate, updated_at: now }).eq("id", finding.id);
      if (returnError) {
        const rollbackErrors = await rollbackLegacyChanges();
        return NextResponse.json({ error: rollbackMessage(returnError.message, rollbackErrors) }, { status: 400 });
      }
      findingChanged = true;
      auditDetails = { ...auditDetails, due_date: nextDueDate };
    } else {
      const capaPriority = String(body.capa_priority || "HIGH");
      if (!CAPA_PRIORITIES.has(capaPriority)) {
        const rollbackErrors = await rollbackLegacyChanges();
        return NextResponse.json({ error: rollbackMessage("Mức ưu tiên CAPA không hợp lệ.", rollbackErrors) }, { status: 400 });
      }
      const { data: capaCode, error: codeError } = await admin.rpc("next_record_code", { p_org: visibleRecord.organization_id, p_record_type: "CAPA", p_work_year: visibleRecord.work_year });
      if (codeError || !capaCode) {
        const rollbackErrors = await rollbackLegacyChanges();
        return NextResponse.json({ error: rollbackMessage(codeError?.message || "Không tạo được mã CAPA.", rollbackErrors) }, { status: 400 });
      }
      const { data: capaRecord, error: capaRecordError } = await admin.from("records").insert({ organization_id: visibleRecord.organization_id, record_type: "CAPA", record_code: capaCode, title: `CAPA từ ${visibleRecord.record_code}: ${visibleRecord.title}`, work_year: visibleRecord.work_year, owner_department_id: finding.lead_department_id || visibleRecord.owner_department_id, owner_user_id: finding.owner_user_id || visibleRecord.owner_user_id, lifecycle_status: "ACTIVE", created_by: user.id }).select("id").single();
      if (capaRecordError || !capaRecord) {
        const rollbackErrors = await rollbackLegacyChanges();
        return NextResponse.json({ error: rollbackMessage(capaRecordError?.message || "Không tạo được hồ sơ CAPA.", rollbackErrors) }, { status: 400 });
      }
      generatedCapaRecordId = String(capaRecord.id);
      const { data: capa, error: capaError } = await admin.from("capas").insert({ record_id: capaRecord.id, problem_statement: finding.description, priority: capaPriority, immediate_correction: finding.immediate_action, lead_department_id: finding.lead_department_id || visibleRecord.owner_department_id, owner_user_id: finding.owner_user_id || visibleRecord.owner_user_id, workflow_status: "DRAFT" }).select("id").single();
      if (capaError || !capa) {
        const rollbackErrors = await rollbackLegacyChanges();
        return NextResponse.json({ error: rollbackMessage(capaError?.message || "Không tạo được CAPA.", rollbackErrors) }, { status: 400 });
      }
      generatedCapaId = String(capa.id);
      const { error: linkError } = await admin.from("record_links").insert({ source_record_id: recordId, target_record_id: capaRecord.id, relation_type: "ESCALATED_TO_CAPA", metadata: { finding_id: finding.id, verification_no: verificationNo }, created_by: user.id });
      if (linkError) {
        const rollbackErrors = await rollbackLegacyChanges();
        return NextResponse.json({ error: rollbackMessage(`Không tạo được liên kết Finding → CAPA: ${linkError.message}`, rollbackErrors) }, { status: 400 });
      }
      newStatus = "ESCALATED_TO_CAPA";
      const { error: escalateError } = await admin.from("findings").update({ workflow_status: newStatus, updated_at: now }).eq("id", finding.id);
      if (escalateError) {
        const rollbackErrors = await rollbackLegacyChanges();
        return NextResponse.json({ error: rollbackMessage(escalateError.message, rollbackErrors) }, { status: 400 });
      }
      findingChanged = true;
      auditDetails = { ...auditDetails, capa_record_id: generatedCapaRecordId, capa_id: generatedCapaId, capa_priority: capaPriority };
    }
  } else return NextResponse.json({ error: "Thao tác Finding không hợp lệ." }, { status: 400 });

  if (!["ACCEPT", "RETURN", "ESCALATE_CAPA"].includes(command)) {
    const { error } = await admin.from("findings").update({ workflow_status: newStatus, updated_at: now }).eq("id", finding.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    findingChanged = true;
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: user.id,
    record_id: recordId,
    table_name: "findings",
    row_id: finding.id,
    action_type: `FINDING_${command}`,
    old_value: { workflow_status: oldStatus, due_date: finding.due_date ?? null },
    new_value: { workflow_status: newStatus, ...auditDetails },
    reason,
    request_meta: { source: "qlcl-ui", transaction },
  });
  if (auditError) {
    const rollbackErrors = await rollbackLegacyChanges();
    return NextResponse.json({ error: rollbackMessage(`Không ghi được audit trail: ${auditError.message}. Thay đổi đã được hoàn tác.`, rollbackErrors) }, { status: 400 });
  }

  const notifyUser = finding.owner_user_id;
  if (notifyUser && notifyUser !== user.id && ["RETURN", "ACCEPT", "ESCALATE_CAPA"].includes(command)) {
    await admin.from("notifications").upsert({
      recipient_user_id: notifyUser,
      notification_type: `FINDING_${command}`,
      priority: command === "RETURN" ? "HIGH" : "NORMAL",
      title: command === "RETURN" ? "Finding được trả lại bổ sung" : command === "ACCEPT" ? "Finding đã được xác nhận đóng" : "Finding đã chuyển sang CAPA",
      message: `${visibleRecord.record_code} · ${visibleRecord.title}`,
      target_record_id: recordId,
      target_route: `/findings/${recordId}`,
      notification_event_key: `finding:${command}:${finding.id}:${notifyUser}:${oldStatus}`,
      is_read: false,
    }, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true });
  }
  return NextResponse.json({ ok: true, status: newStatus, transaction });
}
