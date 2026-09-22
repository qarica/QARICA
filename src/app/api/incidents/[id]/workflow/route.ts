import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { incidentReadyToCloseGate } from "@/lib/quality-gates";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const HARM = new Set(["NO_HARM", "MILD", "MODERATE", "SEVERE", "DEATH", "NEAR_MISS"]);
const REJECT_REASONS = new Set(["DUPLICATE", "INSUFFICIENT_INFO", "NOT_A_MEDICAL_INCIDENT", "OTHER"]);
const START_INV_RPC = "qlcl_start_incident_investigation_v1";
const COMPLETE_INV_RPC = "qlcl_complete_incident_investigation_v1";
const CLOSE_RPC = "qlcl_close_incident_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const body: any = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const permission = command === "CLOSE" ? "incident.close" : command === "TRIAGE" || command === "REJECT" ? "incident.triage" : "incident.investigate";
  const [{ data: allowed }, { data: canTriage }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: permission }),
    supabase.rpc("has_permission", { p_permission_code: "incident.triage" }),
  ]);
  if (!allowed && !canTriage) return NextResponse.json({ error: "Bạn chưa có quyền xử lý bước này." }, { status: 403 });

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
    newStatus = "REJECTED";
    const { error: updateError } = await admin.from("incidents").update({ workflow_status: newStatus, case_owner_user_id: auth.user.id, closed_at: now, updated_at: now }).eq("id", incident.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    const { error: recordError } = await admin.from("records").update({ lifecycle_status: "CLOSED", closed_at: now, updated_at: now }).eq("id", recordId);
    if (recordError) {
      await admin.from("incidents").update({ workflow_status: oldStatus, closed_at: null, updated_at: now }).eq("id", incident.id);
      return NextResponse.json({ error: recordError.message }, { status: 400 });
    }
    await admin.from("record_status_history").insert({ record_id: recordId, old_status: "ACTIVE", new_status: "CLOSED", changed_by: auth.user.id, reason });
    message = "Đã từ chối -- hồ sơ đóng ngay, lý do được lưu lại đầy đủ.";
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
    newStatus = investigate ? "INVESTIGATION_REQUIRED" : "TRIAGED";
    const triageUpdate: Record<string, unknown> = {
      verified_description: description,
      harm_status: harm,
      serious_event_flag: serious,
      investigation_required: investigate,
      rca_required: rca,
      workflow_status: newStatus,
      case_owner_user_id: auth.user.id,
      updated_at: now,
    };
    if (verifiedInitialResponse) {
      triageUpdate.verified_initial_response = verifiedInitialResponse;
      triageUpdate.verified_initial_response_by = auth.user.id;
      triageUpdate.verified_initial_response_at = now;
    }
    const { error: updateError } = await admin.from("incidents").update(triageUpdate).eq("id", incident.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    reason = reason || `Phân loại ${harm}; điều tra=${investigate}; RCA=${rca}; xử trí tức thời=${originalInitialResponse || existingVerifiedResponse || verifiedInitialResponse ? "đã ghi nhận" : "thiếu"}.`;
    message = investigate ? "Đã xác minh; sự cố cần điều tra." : "Đã xác minh và phân loại sự cố.";
  } else if (command === "START_INVESTIGATION") {
    if (oldStatus !== "INVESTIGATION_REQUIRED") return NextResponse.json({ error: "Sự cố chưa ở bước cần điều tra." }, { status: 409 });
    const type = String(body.investigation_type || "").trim();
    if (!type) return NextResponse.json({ error: "Cần chọn loại điều tra." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(START_INV_RPC, {
      p_incident_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_investigation_type: type,
    });
    if (!txError) return NextResponse.json({ ok: true, status: "INVESTIGATING", message: "Đã bắt đầu điều tra sự cố.", transaction: "atomic", result: tx });
    if (!isMissingRpcFunction(txError, START_INV_RPC)) {
      const txMessage = rpcErrorMessage(txError, "Không thể bắt đầu điều tra sự cố.");
      return NextResponse.json({ error: txMessage }, { status: /not active|must be investigation_required|already has|required|not found/i.test(txMessage) ? 409 : 400 });
    }

    const { data: inv, error: invError } = await admin.from("incident_investigations").insert({ incident_id: incident.id, investigation_type: type, started_at: now, rca_required: !!incident.rca_required, status: "IN_PROGRESS" }).select("id").single();
    if (invError || !inv) return NextResponse.json({ error: invError?.message || "Không tạo được hồ sơ điều tra." }, { status: 400 });
    newStatus = "INVESTIGATING";
    const { error: statusError } = await admin.from("incidents").update({ workflow_status: newStatus, updated_at: now }).eq("id", incident.id);
    if (statusError) {
      await admin.from("incident_investigations").delete().eq("id", inv.id);
      return NextResponse.json({ error: statusError.message }, { status: 400 });
    }
    message = "Đã bắt đầu điều tra sự cố.";
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
    if (!txError) return NextResponse.json({ ok: true, status: "ACTION_FOLLOW_UP", message: "Đã hoàn tất điều tra sự cố.", transaction: "atomic", result: tx });
    if (!isMissingRpcFunction(txError, COMPLETE_INV_RPC)) {
      const txMessage = rpcErrorMessage(txError, "Không thể hoàn tất điều tra sự cố.");
      return NextResponse.json({ error: txMessage }, { status: /not active|must be investigating|no active|required|not found/i.test(txMessage) ? 409 : 400 });
    }

    const { data: inv } = await admin.from("incident_investigations").select("id,rca_required").eq("incident_id", incident.id).eq("status", "IN_PROGRESS").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!inv) return NextResponse.json({ error: "Không tìm thấy hồ sơ điều tra đang thực hiện." }, { status: 409 });
    const { error: invError } = await admin.from("incident_investigations").update({ verified_event_summary: summary, harm_conclusion: harmConclusion, conclusion, status: "COMPLETED", completed_at: now }).eq("id", inv.id);
    if (invError) return NextResponse.json({ error: invError.message }, { status: 400 });
    newStatus = "ACTION_FOLLOW_UP";
    const { error: statusError } = await admin.from("incidents").update({ workflow_status: newStatus, updated_at: now }).eq("id", incident.id);
    if (statusError) {
      await admin.from("incident_investigations").update({ verified_event_summary: null, harm_conclusion: null, conclusion: null, status: "IN_PROGRESS", completed_at: null }).eq("id", inv.id);
      return NextResponse.json({ error: statusError.message }, { status: 400 });
    }
    reason = reason || "Hoàn tất điều tra và chuyển theo dõi hành động phòng ngừa tái diễn.";
    message = "Đã hoàn tất điều tra sự cố.";
  } else if (command === "START_FOLLOW_UP") {
    if (oldStatus !== "TRIAGED") return NextResponse.json({ error: "Sự cố chưa ở bước có thể theo dõi hành động." }, { status: 409 });
    newStatus = "ACTION_FOLLOW_UP";
    const { error: updateError } = await admin.from("incidents").update({ workflow_status: newStatus, updated_at: now }).eq("id", incident.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    message = "Đã chuyển sang theo dõi hành động.";
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
    newStatus = "AWAITING_CLOSURE";
    const { error: updateError } = await admin.from("incidents").update({ workflow_status: newStatus, updated_at: now }).eq("id", incident.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    reason = reason || (noActionRequired ? `Không cần Action bổ sung: ${noActionReason}` : null);
    message = "Hồ sơ đã đủ gate và chờ xác nhận đóng.";
  } else if (command === "CLOSE") {
    if (oldStatus !== "AWAITING_CLOSURE") return NextResponse.json({ error: "Sự cố chưa đủ gate để đóng." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Kết luận đóng sự cố là bắt buộc." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(CLOSE_RPC, {
      p_incident_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });
    if (!txError) return NextResponse.json({ ok: true, status: "CLOSED", message: "Đã đóng sự cố; toàn bộ báo cáo và lịch sử xử lý được giữ nguyên.", transaction: "atomic", result: tx });
    if (!isMissingRpcFunction(txError, CLOSE_RPC)) {
      const txMessage = rpcErrorMessage(txError, "Không thể đóng sự cố.");
      return NextResponse.json({ error: txMessage }, { status: /not active|must be awaiting_closure|required|incomplete|evidence|not found/i.test(txMessage) ? 409 : 400 });
    }

    const { data: links } = await admin.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "HAS_ACTION");
    const ids = (links || []).map((x: any) => x.target_record_id).filter(Boolean);
    const { data: actions } = ids.length ? await admin.from("actions").select("workflow_status").in("record_id", ids) : { data: [] };
    const incomplete = (actions || []).filter((x: any) => !["COMPLETED", "CANCELLED", "NOT_APPLICABLE"].includes(String(x.workflow_status))).length;
    const { count } = await admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId);
    const { count: capaLinkCount } = await admin.from("record_links").select("id", { count: "exact", head: true }).eq("source_record_id", recordId).eq("relation_type", "GENERATED_CAPA");
    const gate = incidentReadyToCloseGate({ actionCount: ids.length, incompleteActionCount: incomplete, evidenceCount: count ?? 0, isSerious: !!incident.serious_event_flag, hasCapa: (capaLinkCount ?? 0) > 0 });
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 409 });

    newStatus = "CLOSED";
    const { error: incidentError } = await admin.from("incidents").update({ workflow_status: newStatus, closed_at: now, updated_at: now }).eq("id", incident.id);
    if (incidentError) return NextResponse.json({ error: incidentError.message }, { status: 400 });
    const { error: recordError } = await admin.from("records").update({ lifecycle_status: "CLOSED", closed_at: now, updated_at: now }).eq("id", recordId);
    if (recordError) {
      await admin.from("incidents").update({ workflow_status: "AWAITING_CLOSURE", closed_at: null, updated_at: now }).eq("id", incident.id);
      return NextResponse.json({ error: recordError.message }, { status: 400 });
    }
    await admin.from("record_status_history").insert({ record_id: recordId, old_status: "ACTIVE", new_status: "CLOSED", changed_by: auth.user.id, reason });
    message = "Đã đóng sự cố; toàn bộ báo cáo và lịch sử xử lý được giữ nguyên.";
  } else return NextResponse.json({ error: "Thao tác sự cố không hợp lệ." }, { status: 400 });

  const legacyAtomicCommand = ["START_INVESTIGATION", "COMPLETE_INVESTIGATION", "CLOSE"].includes(command);
  await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "incidents", row_id: incident.id, action_type: `INCIDENT_${command}`, old_value: { workflow_status: oldStatus }, new_value: { workflow_status: newStatus }, reason, request_meta: { source: "qlcl-ui", sensitive: true, transaction: legacyAtomicCommand ? "legacy-fallback" : undefined } });
  return NextResponse.json({ ok: true, status: newStatus, message, transaction: legacyAtomicCommand ? "legacy-fallback" : "direct" });
}
