import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { incidentReadyToCloseGate } from "@/lib/quality-gates";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const HARM = new Set(["NO_HARM", "MILD", "MODERATE", "SEVERE", "DEATH", "NEAR_MISS"]);
const REJECT_REASONS = new Set(["DUPLICATE", "INSUFFICIENT_INFO", "NOT_A_MEDICAL_INCIDENT", "OTHER"]);
const START_INV_RPC = "qlcl_start_incident_investigation_v1";
const COMPLETE_INV_RPC = "qlcl_complete_incident_investigation_v1";
const CLOSE_RPC = "qlcl_close_incident_v1";
const TRANSITION_RPC = "qlcl_transition_incident_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const body: any = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const permission = command === "CLOSE" ? "incident.close" : command === "TRIAGE" || command === "REJECT" ? "incident.triage" : "incident.investigate";
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: permission });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền xử lý bước này." }, { status: 403 });

  const { id: recordId } = await params;
  const { data: record } = await supabase.from("records").select("id,lifecycle_status").eq("id", recordId).eq("record_type", "INCIDENT").maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy sự cố hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Hồ sơ sự cố không còn hoạt động." }, { status: 409 });

  const admin: any = createAdminClient();
  const { data: incident, error } = await admin.from("incidents").select("id,workflow_status,investigation_required,rca_required,serious_event_flag,verified_description,harm_status,verified_initial_response").eq("record_id", recordId).maybeSingle();
  if (error || !incident) return NextResponse.json({ error: error?.message || "Không tìm thấy dữ liệu sự cố." }, { status: 404 });

  const oldStatus = String(incident.workflow_status || "REPORTED");
  const now = new Date().toISOString();
  let newStatus = oldStatus;
  let reason = String(body.comment || "").trim() || null;
  let message = "Đã cập nhật sự cố.";

  if (command === "REJECT") {
    if (!["REPORTED", "RETURNED"].includes(oldStatus)) return NextResponse.json({ error: "Chỉ có thể từ chối hồ sơ đang ở bước tiếp nhận/xác minh." }, { status: 409 });
    const reasonCode = String(body.reject_reason_code || "").toUpperCase();
    if (!REJECT_REASONS.has(reasonCode)) return NextResponse.json({ error: "Vui lòng chọn lý do từ chối hợp lệ." }, { status: 400 });
    const note = String(body.comment || "").trim();
    if (reasonCode === "OTHER" && !note) return NextResponse.json({ error: "Lý do \"Khác\" cần ghi rõ nội dung." }, { status: 400 });
    const REASON_LABEL: Record<string, string> = { DUPLICATE: "Trùng lặp với báo cáo khác", INSUFFICIENT_INFO: "Không đủ thông tin để xác minh dù đã liên hệ", NOT_A_MEDICAL_INCIDENT: "Không phải sự cố y khoa (hiểu lầm/ngoài phạm vi)", OTHER: "Khác" };
    reason = `${REASON_LABEL[reasonCode]}${note ? `: ${note}` : ""}`;
    const { data: tx, error: txError } = await admin.rpc("qlcl_reject_incident_v1", { p_incident_record_id: recordId, p_actor_user_id: auth.user.id, p_reason: reason });
    if (txError) return NextResponse.json({ error: rpcErrorMessage(txError, "Không thể từ chối sự cố.") }, { status: 409 });
    return NextResponse.json({ ok: true, status: "REJECTED", message: "Đã từ chối -- hồ sơ đóng ngay, lý do được lưu lại đầy đủ.", transaction: "atomic", result: tx });
  } else if (command === "TRIAGE") {
    if (!["REPORTED", "RETURNED"].includes(oldStatus)) return NextResponse.json({ error: "Sự cố không ở bước tiếp nhận/xác minh." }, { status: 409 });
    const description = String(body.verified_description || "").trim();
    const harm = String(body.harm_status || "").toUpperCase();
    if (!description || !HARM.has(harm)) return NextResponse.json({ error: "Cần mô tả đã xác minh và mức tổn hại hợp lệ." }, { status: 400 });
    const harmRequiresSerious = harm === "SEVERE" || harm === "DEATH";
    const serious = !!body.serious_event_flag || harmRequiresSerious;
    const investigate = !!body.investigation_required || serious;
    const rca = !!body.rca_required || serious;
    const verifiedInitialResponse = String(body.verified_initial_response || "").trim();
    const { data: latestReport } = await admin
      .from("incident_reports")
      .select("initial_response_description")
      .eq("incident_id", incident.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const originalInitialResponse = String(latestReport?.initial_response_description || "").trim();
    const existingVerifiedResponse = String(incident.verified_initial_response || "").trim();
    if (!originalInitialResponse && !existingVerifiedResponse && !verifiedInitialResponse) {
      return NextResponse.json({ error: "Cần ghi nhận xử trí tức thời hoặc ghi rõ không áp dụng trước khi hoàn tất xác minh." }, { status: 400 });
    }
    const { data: tx, error: txError } = await admin.rpc("qlcl_triage_incident_v1", { p_incident_record_id: recordId, p_actor_user_id: auth.user.id, p_description: description, p_harm: harm, p_serious: serious, p_investigation_required: investigate, p_rca_required: rca, p_verified_initial_response: verifiedInitialResponse || null, p_reason: reason });
    if (txError) return NextResponse.json({ error: rpcErrorMessage(txError, "Không thể xác minh/phân loại sự cố.") }, { status: 409 });
    newStatus = investigate ? "INVESTIGATION_REQUIRED" : "TRIAGED";
    message = investigate ? "Đã xác minh; sự cố cần điều tra." : "Đã xác minh và phân loại sự cố.";
    return NextResponse.json({ ok: true, status: newStatus, message, transaction: "atomic", result: tx });
  } else if (command === "START_INVESTIGATION") {
    if (oldStatus !== "INVESTIGATION_REQUIRED") return NextResponse.json({ error: "Sự cố chưa ở bước cần điều tra." }, { status: 409 });
    const type = String(body.investigation_type || "").trim();
    if (!type) return NextResponse.json({ error: "Cần chọn loại điều tra." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(START_INV_RPC, {
      p_incident_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_investigation_type: type,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể bắt đầu điều tra sự cố.");
      return NextResponse.json({ error: txMessage }, { status: /not active|investigation_required|already has|required|not found/i.test(txMessage) ? 409 : 400 });
    }
    return NextResponse.json({
      ok: true,
      status: "INVESTIGATING",
      message: "Đã bắt đầu điều tra sự cố.",
      transaction: "atomic",
      result: tx,
    });
  } else if (command === "COMPLETE_INVESTIGATION") {
    if (oldStatus !== "INVESTIGATING") return NextResponse.json({ error: "Sự cố không ở bước điều tra." }, { status: 409 });
    const summary = String(body.verified_event_summary || incident.verified_description || "").trim();
    const harmConclusion = String(body.harm_conclusion || incident.harm_status || "").trim();
    const conclusion = String(body.conclusion || "").trim();
    if (!summary || !harmConclusion || !conclusion) return NextResponse.json({ error: "Cần đủ sự kiện xác minh, kết luận tổn hại và kết luận điều tra." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(COMPLETE_INV_RPC, {
      p_incident_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_verified_event_summary: summary,
      p_harm_conclusion: harmConclusion,
      p_conclusion: conclusion,
      p_reason: reason,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể hoàn tất điều tra sự cố.");
      return NextResponse.json({ error: txMessage }, { status: /not active|investigating|no active|required|not found/i.test(txMessage) ? 409 : 400 });
    }
    return NextResponse.json({
      ok: true,
      status: "ACTION_FOLLOW_UP",
      message: "Đã hoàn tất điều tra sự cố.",
      transaction: "atomic",
      result: tx,
    });
  } else if (command === "START_FOLLOW_UP") {
    if (oldStatus !== "TRIAGED") return NextResponse.json({ error: "Sự cố chưa ở bước có thể theo dõi hành động." }, { status: 409 });
    newStatus = "ACTION_FOLLOW_UP";
    reason = reason || "Chuyển sang theo dõi hành động sau xác minh sự cố.";
    const { data: tx, error: txError } = await admin.rpc(TRANSITION_RPC, { p_incident_record_id: recordId, p_actor_user_id: auth.user.id, p_command: command, p_reason: reason });
    if (txError) return NextResponse.json({ error: rpcErrorMessage(txError, "Không thể chuyển sang theo dõi hành động.") }, { status: 409 });
    return NextResponse.json({ ok: true, status: newStatus, message: "Đã chuyển sang theo dõi hành động.", transaction: "atomic", result: tx });
  } else if (command === "READY_TO_CLOSE") {
    if (oldStatus !== "ACTION_FOLLOW_UP") return NextResponse.json({ error: "Sự cố chưa ở bước theo dõi hành động." }, { status: 409 });
    const { data: links } = await admin.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "HAS_ACTION");
    const ids = (links || []).map((x: any) => x.target_record_id).filter(Boolean);
    const { data: actions } = ids.length ? await admin.from("actions").select("workflow_status").in("record_id", ids) : { data: [] };
    const incomplete = (actions || []).filter((x: any) => !["COMPLETED", "CANCELLED", "NOT_APPLICABLE"].includes(String(x.workflow_status))).length;
    const { count } = await admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId);
    const { count: capaLinkCount } = await admin.from("record_links").select("id", { count: "exact", head: true }).eq("source_record_id", recordId).eq("relation_type", "GENERATED_CAPA");
    const noActionRequired = !!body.no_action_required;
    const noActionReason = String(body.no_action_reason || "").trim();
    const gate = incidentReadyToCloseGate({ actionCount: ids.length, incompleteActionCount: incomplete, evidenceCount: count ?? 0, isSerious: !!incident.serious_event_flag, hasCapa: (capaLinkCount ?? 0) > 0, noActionRequired, noActionReason });
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 409 });

    // RCA incidents use the same traceability source of truth as the database close gate.
    if (incident.rca_required) {
      const { data: trace, error: traceError } = await admin.rpc("qlcl_incident_action_trace_state_v1", { p_incident_record_id: recordId });
      if (traceError) return NextResponse.json({ error: rpcErrorMessage(traceError, "Không kiểm tra được liên kết RCA/Action/CAPA.") }, { status: 409 });
      const requiredRoots = Number(trace?.required_root_count || 0);
      const uncoveredRoots = Number(trace?.uncovered_root_count || 0);
      const tracedActions = Number(trace?.action_count || 0);
      const tracedIncomplete = Number(trace?.incomplete_action_count || 0);
      const ineffectiveCapas = Number(trace?.ineffective_capa_count || 0);
      if (!trace?.rca_analysis_id || requiredRoots < 1) return NextResponse.json({ error: "RCA phải hoàn tất và xác định ít nhất một nguyên nhân gốc cần hành động." }, { status: 409 });
      if (uncoveredRoots > 0) return NextResponse.json({ error: `Còn ${uncoveredRoots} nguyên nhân gốc chưa liên kết Action đang hoạt động.` }, { status: 409 });
      if (tracedActions < 1 || tracedIncomplete > 0) return NextResponse.json({ error: "Action từ RCA chưa đầy đủ hoặc chưa hoàn tất." }, { status: 409 });
      if (ineffectiveCapas > 0) return NextResponse.json({ error: "CAPA liên kết phải được đánh giá EFFECTIVE hoặc CLOSED trước khi chờ đóng." }, { status: 409 });
    }
    newStatus = "AWAITING_CLOSURE";
    reason = reason || (noActionRequired ? `Không cần Action bổ sung: ${noActionReason}` : null);
    const { data: tx, error: txError } = await admin.rpc(TRANSITION_RPC, { p_incident_record_id: recordId, p_actor_user_id: auth.user.id, p_command: command, p_reason: reason });
    if (txError) return NextResponse.json({ error: rpcErrorMessage(txError, "Không thể chuyển hồ sơ sang chờ đóng.") }, { status: 409 });
    return NextResponse.json({ ok: true, status: newStatus, message: "Hồ sơ đã đủ gate và chờ xác nhận đóng.", transaction: "atomic", result: tx });
  } else if (command === "CLOSE") {
    if (oldStatus !== "AWAITING_CLOSURE") return NextResponse.json({ error: "Sự cố chưa đủ gate để đóng." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Kết luận đóng sự cố là bắt buộc." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(CLOSE_RPC, {
      p_incident_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể đóng sự cố.");
      return NextResponse.json({ error: txMessage }, { status: /not active|awaiting_closure|required|incomplete|evidence|not found/i.test(txMessage) ? 409 : 400 });
    }
    return NextResponse.json({
      ok: true,
      status: "CLOSED",
      message: "Đã đóng sự cố; toàn bộ báo cáo và lịch sử xử lý được giữ nguyên.",
      transaction: "atomic",
      result: tx,
    });
  } else return NextResponse.json({ error: "Thao tác sự cố không hợp lệ." }, { status: 400 });

  await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "incidents", row_id: incident.id, action_type: `INCIDENT_${command}`, old_value: { workflow_status: oldStatus }, new_value: { workflow_status: newStatus }, reason, request_meta: { source: "qlcl-ui", sensitive: true } });
  return NextResponse.json({ ok: true, status: newStatus, message, transaction: "direct" });
}
