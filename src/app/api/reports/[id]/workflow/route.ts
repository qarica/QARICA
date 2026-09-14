import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const SUBMIT_RPC = "qlcl_submit_report_v1";
const COMPLETE_RPC = "qlcl_confirm_report_received_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "reports.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền xử lý báo cáo." }, { status: 403 });

  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const reason = String(body.comment || "").trim() || null;
  const now = new Date().toISOString();

  const { data: visible } = await supabase.from("records").select("id").eq("id", recordId).eq("record_type", "REPORT").maybeSingle();
  if (!visible) return NextResponse.json({ error: "Không tìm thấy báo cáo hoặc bạn không có quyền xem." }, { status: 404 });

  const admin = createAdminClient();
  const { data: record } = await admin.from("records").select("lifecycle_status,owner_department_id,owner_user_id").eq("id", recordId).single();
  const { data: report } = await admin.from("reporting_obligations").select("id,workflow_status,due_date,recipient_name,submission_method").eq("record_id", recordId).single();
  if (!record || !report) return NextResponse.json({ error: "Thiếu dữ liệu nghĩa vụ báo cáo." }, { status: 404 });

  const oldStatus = String(report.workflow_status || "NOT_DUE");
  let next = oldStatus;
  let message = "Đã cập nhật báo cáo.";

  const [{ data: links }, { count: evidence }, { data: submissions }] = await Promise.all([
    admin.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "HAS_ACTION"),
    admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId),
    admin.from("report_submissions").select("submission_version").eq("reporting_obligation_id", report.id).order("submission_version", { ascending: false }).limit(1),
  ]);
  const actionRecordIds = (links ?? []).map((x: any) => x.target_record_id).filter(Boolean);
  const { data: actions } = actionRecordIds.length ? await admin.from("actions").select("workflow_status").in("record_id", actionRecordIds) : { data: [] as any[] };
  const incomplete = (actions ?? []).filter((x: any) => !["COMPLETED", "CANCELLED", "NOT_APPLICABLE"].includes(String(x.workflow_status))).length;

  if (command === "START_PREPARING") {
    if (!["NOT_DUE", "DUE"].includes(oldStatus) || !record.owner_department_id || !record.owner_user_id || !report.due_date || !report.recipient_name) return NextResponse.json({ error: "Cần đủ owner, hạn nộp và nơi nhận trước khi chuẩn bị." }, { status: 409 });
    next = "PREPARING";
    message = "Đã bắt đầu chuẩn bị báo cáo.";
  } else if (command === "SUBMIT_REVIEW") {
    if (oldStatus !== "PREPARING" || incomplete || !evidence) return NextResponse.json({ error: incomplete ? `Còn ${incomplete} Action chưa hoàn thành.` : "Cần bản dự thảo/minh chứng dữ liệu trước khi gửi rà soát." }, { status: 409 });
    next = "REVIEWING";
    message = "Đã gửi báo cáo để rà soát.";
  } else if (command === "RETURN") {
    if (oldStatus !== "REVIEWING" || !reason) return NextResponse.json({ error: "Cần lý do trả lại báo cáo." }, { status: 409 });
    next = "PREPARING";
    message = "Đã trả lại báo cáo để chỉnh sửa.";
  } else if (command === "SUBMIT") {
    if (oldStatus !== "REVIEWING" || !reason || !evidence) return NextResponse.json({ error: "Cần kết luận rà soát và bằng chứng/bản cuối trước khi gửi." }, { status: 409 });
    const channel = String(body.channel || report.submission_method || "OTHER");
    const officialDocumentNumber = String(body.official_document_number || "").trim() || null;
    const { data: tx, error: txError } = await admin.rpc(SUBMIT_RPC, {
      p_report_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
      p_channel: channel,
      p_official_document_number: officialDocumentNumber,
    });
    if (!txError) {
      const version = typeof tx === "object" && tx && "submission_version" in tx ? Number((tx as Record<string, unknown>).submission_version || 0) : 0;
      return NextResponse.json({ ok: true, status: "SUBMITTED", message: version ? `Đã ghi nhận lần gửi báo cáo số ${version}.` : "Đã ghi nhận lần gửi báo cáo.", transaction: "atomic", result: tx });
    }
    if (!isMissingRpcFunction(txError, SUBMIT_RPC)) {
      const txMessage = rpcErrorMessage(txError, "Không thể ghi nhận lần gửi báo cáo.");
      return NextResponse.json({ error: txMessage }, { status: /not active|must be reviewing|required|evidence|recipient/i.test(txMessage) ? 409 : 400 });
    }

    const version = Number(submissions?.[0]?.submission_version || 0) + 1;
    const { data: submission, error: submitError } = await admin.from("report_submissions").insert({ reporting_obligation_id: report.id, submission_version: version, submission_type: version === 1 ? "INITIAL" : "RESUBMISSION", submitted_at: now, recipient: report.recipient_name, channel, official_document_number: officialDocumentNumber }).select("reporting_obligation_id,submission_version").single();
    if (submitError || !submission) return NextResponse.json({ error: submitError?.message || "Không ghi nhận được lần gửi báo cáo." }, { status: 400 });
    const { error: statusError } = await admin.from("reporting_obligations").update({ workflow_status: "SUBMITTED", updated_at: now }).eq("id", report.id);
    if (statusError) {
      await admin.from("report_submissions").delete().eq("reporting_obligation_id", report.id).eq("submission_version", version);
      return NextResponse.json({ error: statusError.message }, { status: 400 });
    }
    await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "reporting_obligations", row_id: report.id, action_type: "REPORT_SUBMIT", old_value: { workflow_status: oldStatus }, new_value: { workflow_status: "SUBMITTED", submission_version: version }, reason, request_meta: { source: "qlcl-ui", transaction: "legacy-fallback" } });
    return NextResponse.json({ ok: true, status: "SUBMITTED", message: `Đã ghi nhận lần gửi báo cáo số ${version}.`, transaction: "legacy-fallback" });
  } else if (command === "CONFIRM_RECEIVED") {
    if (oldStatus !== "SUBMITTED" || !reason) return NextResponse.json({ error: "Cần xác nhận đã gửi/tiếp nhận để hoàn tất." }, { status: 409 });
    if (!evidence) return NextResponse.json({ error: "Cần bằng chứng gửi/tiếp nhận trước khi hoàn tất." }, { status: 409 });
    const { data: tx, error: txError } = await admin.rpc(COMPLETE_RPC, {
      p_report_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });
    if (!txError) return NextResponse.json({ ok: true, status: "COMPLETED", message: "Đã hoàn tất nghĩa vụ báo cáo với bằng chứng gửi/tiếp nhận.", transaction: "atomic", result: tx });
    if (!isMissingRpcFunction(txError, COMPLETE_RPC)) {
      const txMessage = rpcErrorMessage(txError, "Không thể hoàn tất nghĩa vụ báo cáo.");
      return NextResponse.json({ error: txMessage }, { status: /not active|must be submitted|required|no report submission|evidence/i.test(txMessage) ? 409 : 400 });
    }

    const { error: reportError } = await admin.from("reporting_obligations").update({ workflow_status: "COMPLETED", updated_at: now }).eq("id", report.id);
    if (reportError) return NextResponse.json({ error: reportError.message }, { status: 400 });
    const { error: recordError } = await admin.from("records").update({ lifecycle_status: "CLOSED", closed_at: now, updated_at: now }).eq("id", recordId);
    if (recordError) {
      await admin.from("reporting_obligations").update({ workflow_status: "SUBMITTED", updated_at: now }).eq("id", report.id);
      return NextResponse.json({ error: recordError.message }, { status: 400 });
    }
    await admin.from("record_status_history").insert({ record_id: recordId, old_status: record.lifecycle_status, new_status: "CLOSED", changed_by: auth.user.id, reason });
    await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "reporting_obligations", row_id: report.id, action_type: "REPORT_CONFIRM_RECEIVED", old_value: { workflow_status: oldStatus }, new_value: { workflow_status: "COMPLETED" }, reason, request_meta: { source: "qlcl-ui", transaction: "legacy-fallback" } });
    return NextResponse.json({ ok: true, status: "COMPLETED", message: "Đã hoàn tất nghĩa vụ báo cáo với bằng chứng gửi/tiếp nhận.", transaction: "legacy-fallback" });
  } else return NextResponse.json({ error: "Thao tác báo cáo không hợp lệ." }, { status: 400 });

  const { error } = await admin.from("reporting_obligations").update({ workflow_status: next, updated_at: now }).eq("id", report.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "reporting_obligations", row_id: report.id, action_type: `REPORT_${command}`, old_value: { workflow_status: oldStatus }, new_value: { workflow_status: next }, reason, request_meta: { source: "qlcl-ui" } });
  return NextResponse.json({ ok: true, status: next, message, transaction: "direct" });
}
