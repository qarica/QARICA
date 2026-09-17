import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const CLOSE_RPC = "qlcl_close_fmea_v1";
const COMPLETE = new Set(["COMPLETED", "CANCELLED", "NOT_APPLICABLE"]);

async function getModeActionGate(admin: any, recordId: string, modes: any[]) {
  const highIds = (modes || []).filter((x: any) => x.is_high_priority).map((x: any) => String(x.id));
  if (!highIds.length) return { high: 0, linked: 0, incomplete: 0 };
  const [{ data: modeLinks, error: modeLinkError }, { data: canonicalLinks }] = await Promise.all([
    admin.from("fmea_failure_mode_action_links").select("failure_mode_id,action_record_id").in("failure_mode_id", highIds),
    admin.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "HAS_ACTION"),
  ]);
  if (modeLinkError) throw new Error(modeLinkError.message);
  const canonical = new Set((canonicalLinks || []).map((x: any) => String(x.target_record_id)));
  const validLinks = (modeLinks || []).filter((x: any) => canonical.has(String(x.action_record_id)));
  const linkedModes = new Set(validLinks.map((x: any) => String(x.failure_mode_id)));
  const actionRecordIds = Array.from(new Set(validLinks.map((x: any) => String(x.action_record_id)).filter(Boolean)));
  const { data: actions } = actionRecordIds.length ? await admin.from("actions").select("record_id,workflow_status").in("record_id", actionRecordIds) : { data: [] };
  const incomplete = (actions || []).filter((x: any) => !COMPLETE.has(String(x.workflow_status || ""))).length;
  return { high: highIds.length, linked: linkedModes.size, incomplete };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "risk.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền quản lý FMEA/HFMEA." }, { status: 403 });

  const { id: recordId } = await params;
  const body: any = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const { data: record } = await supabase.from("records").select("id,lifecycle_status").eq("id", recordId).eq("record_type", "FMEA").maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy FMEA hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "FMEA không còn hoạt động." }, { status: 409 });

  const admin: any = createAdminClient();
  const { data: study, error } = await admin.from("fmea_studies").select("id,method,workflow_status,scoring_model_version_id").eq("record_id", recordId).maybeSingle();
  if (error || !study) return NextResponse.json({ error: error?.message || "Không tìm thấy nghiên cứu FMEA." }, { status: 404 });
  const { data: steps } = await admin.from("fmea_process_steps").select("id").eq("fmea_study_id", study.id);
  const stepIds = (steps || []).map((x: any) => x.id);
  const { data: modes } = stepIds.length ? await admin.from("fmea_failure_modes").select("id,is_high_priority").in("process_step_id", stepIds) : { data: [] };
  const oldStatus = String(study.workflow_status || "DRAFT");
  const now = new Date().toISOString();
  const reason = String(body.comment || "").trim() || null;
  let newStatus = oldStatus;
  let message = "Đã cập nhật FMEA.";

  if (command === "SUBMIT") {
    if (oldStatus !== "DRAFT") return NextResponse.json({ error: "Chỉ FMEA nháp mới được gửi phê duyệt." }, { status: 409 });
    if (!study.scoring_model_version_id || !stepIds.length || !(modes || []).length) return NextResponse.json({ error: "Cần mô hình chấm điểm đã phát hành, bước quy trình và failure mode." }, { status: 409 });
    const modeIds = (modes || []).map((x: any) => x.id);
    const { data: baselineRows, error: baselineError } = await admin.from("fmea_mode_assessments").select("failure_mode_id").in("failure_mode_id", modeIds).eq("assessment_type", "BASELINE");
    if (!baselineError) {
      const baselineModes = new Set((baselineRows || []).map((x: any) => String(x.failure_mode_id)));
      if (baselineModes.size < modeIds.length) return NextResponse.json({ error: `Còn ${modeIds.length - baselineModes.size} failure mode chưa có baseline S/O/D/RPN.` }, { status: 409 });
    }
    newStatus = "PENDING_APPROVAL";
    const { error: updateError } = await admin.from("fmea_studies").update({ workflow_status: newStatus, updated_at: now }).eq("id", study.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    message = "Đã gửi FMEA phê duyệt.";
  } else if (command === "APPROVE") {
    if (oldStatus !== "PENDING_APPROVAL") return NextResponse.json({ error: "FMEA chưa ở bước chờ phê duyệt." }, { status: 409 });
    newStatus = "IN_PROGRESS";
    const { error: updateError } = await admin.from("fmea_studies").update({ workflow_status: newStatus, approved_at: now, updated_at: now }).eq("id", study.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    message = "Đã phê duyệt và chuyển triển khai can thiệp.";
  } else if (command === "REQUEST_RESIDUAL_REVIEW") {
    if (oldStatus !== "IN_PROGRESS") return NextResponse.json({ error: "FMEA chưa ở bước triển khai." }, { status: 409 });
    let gate;
    try { gate = await getModeActionGate(admin, recordId, modes || []); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Không kiểm tra được liên kết Action theo failure mode." }, { status: 503 }); }
    if (gate.linked < gate.high) return NextResponse.json({ error: `Còn ${gate.high - gate.linked} failure mode ưu tiên cao chưa có Action riêng.` }, { status: 409 });
    if (gate.incomplete) return NextResponse.json({ error: `Còn ${gate.incomplete} Action của failure mode ưu tiên cao chưa hoàn thành.` }, { status: 409 });
    const { count } = await admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId);
    if (!count) return NextResponse.json({ error: "Cần minh chứng thử nghiệm/can thiệp trước khi re-score." }, { status: 409 });
    newStatus = "RESIDUAL_REVIEW";
    const { error: updateError } = await admin.from("fmea_studies").update({ workflow_status: newStatus, updated_at: now }).eq("id", study.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    message = "Đã chuyển sang re-score và xem xét residual risk.";
  } else if (command === "CLOSE") {
    if (oldStatus !== "RESIDUAL_REVIEW") return NextResponse.json({ error: "FMEA chưa ở bước xem xét residual risk." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Kết luận re-score và chấp nhận residual risk là bắt buộc." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(CLOSE_RPC, { p_fmea_record_id: recordId, p_actor_user_id: auth.user.id, p_reason: reason });
    if (!txError) return NextResponse.json({ ok: true, status: "CLOSED", message: "Đã đóng FMEA sau re-score và chấp nhận residual risk.", transaction: "atomic", result: tx });
    if (!isMissingRpcFunction(txError, CLOSE_RPC)) {
      const txMessage = rpcErrorMessage(txError, "Không thể đóng FMEA.");
      return NextResponse.json({ error: txMessage }, { status: /not active|must be residual_review|action|evidence|required|not found|reassessment/i.test(txMessage) ? 409 : 400 });
    }

    let gate;
    try { gate = await getModeActionGate(admin, recordId, modes || []); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Không kiểm tra được liên kết Action theo failure mode." }, { status: 503 }); }
    if (gate.linked < gate.high) return NextResponse.json({ error: `Còn ${gate.high - gate.linked} failure mode ưu tiên cao chưa có Action riêng.` }, { status: 409 });
    if (gate.incomplete) return NextResponse.json({ error: `Còn ${gate.incomplete} Action của failure mode ưu tiên cao chưa hoàn thành.` }, { status: 409 });
    const highIds = (modes || []).filter((x: any) => x.is_high_priority).map((x: any) => x.id);
    const { data: residualRows } = highIds.length ? await admin.from("fmea_mode_assessments").select("failure_mode_id").in("failure_mode_id", highIds).eq("assessment_type", "RESIDUAL") : { data: [] };
    const residualModes = new Set((residualRows || []).map((x: any) => String(x.failure_mode_id)));
    if (residualModes.size < highIds.length) return NextResponse.json({ error: `Còn ${highIds.length - residualModes.size} failure mode ưu tiên cao chưa re-score residual.` }, { status: 409 });
    const { count } = await admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId);
    if (!count) return NextResponse.json({ error: "Cần minh chứng thử nghiệm/can thiệp trước khi đóng FMEA." }, { status: 409 });

    newStatus = "CLOSED";
    const { error: studyError } = await admin.from("fmea_studies").update({ workflow_status: newStatus, updated_at: now }).eq("id", study.id);
    if (studyError) return NextResponse.json({ error: studyError.message }, { status: 400 });
    const { error: recordError } = await admin.from("records").update({ lifecycle_status: "CLOSED", closed_at: now, updated_at: now }).eq("id", recordId);
    if (recordError) { await admin.from("fmea_studies").update({ workflow_status: "RESIDUAL_REVIEW", updated_at: now }).eq("id", study.id); return NextResponse.json({ error: recordError.message }, { status: 400 }); }
    await admin.from("record_status_history").insert({ record_id: recordId, old_status: "ACTIVE", new_status: "CLOSED", changed_by: auth.user.id, reason });
    await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "fmea_studies", row_id: study.id, action_type: "FMEA_CLOSE", old_value: { workflow_status: oldStatus }, new_value: { workflow_status: newStatus }, reason, request_meta: { source: "qlcl-ui", method: study.method, transaction: "legacy-fallback" } });
    return NextResponse.json({ ok: true, status: newStatus, message: "Đã đóng FMEA sau re-score và chấp nhận residual risk.", transaction: "legacy-fallback" });
  } else return NextResponse.json({ error: "Thao tác FMEA không hợp lệ." }, { status: 400 });

  await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "fmea_studies", row_id: study.id, action_type: `FMEA_${command}`, old_value: { workflow_status: oldStatus }, new_value: { workflow_status: newStatus }, reason, request_meta: { source: "qlcl-ui", method: study.method } });
  return NextResponse.json({ ok: true, status: newStatus, message, transaction: "direct" });
}
