import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const TERMINAL = ["CANCELLED", "ARCHIVED", "INACTIVE", "RETIRED"];
const ACCEPT_DECISIONS = ["ACCEPT", "ACCEPT_WITH_MONITORING", "NOT_ACCEPTED", "ESCALATE"];
const ACCEPT_RISK_RPC = "qlcl_accept_risk_v1";
const RETIRE_RISK_RPC = "qlcl_retire_risk_v1";

function hcmDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { data: canManage } = await supabase.rpc("has_permission", { p_permission_code: "risk.manage" });
  if (!canManage) return NextResponse.json({ error: "Bạn chưa có quyền quản lý rủi ro." }, { status: 403 });

  const { id: recordId } = await params;
  const body: any = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  if (!command) return NextResponse.json({ error: "Thiếu thao tác Risk Register." }, { status: 400 });

  const { data: record } = await supabase
    .from("records")
    .select("id,record_code,title,work_year,lifecycle_status,owner_user_id")
    .eq("id", recordId)
    .eq("record_type", "RISK")
    .maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy rủi ro hoặc bạn không có quyền truy cập." }, { status: 404 });
  if (TERMINAL.includes(String(record.lifecycle_status))) return NextResponse.json({ error: "Hồ sơ rủi ro đã ngưng hoạt động." }, { status: 409 });

  const admin: any = createAdminClient();
  const { data: risk, error: riskError } = await admin
    .from("risks")
    .select("id,owner_user_id,workflow_status,next_review_date")
    .eq("record_id", recordId)
    .maybeSingle();
  if (riskError) return NextResponse.json({ error: riskError.message }, { status: 400 });
  if (!risk) return NextResponse.json({ error: "Không tìm thấy dữ liệu Risk Register." }, { status: 404 });

  const oldStatus = String(risk.workflow_status || "IDENTIFIED");
  let newStatus = oldStatus;
  let reason = String(body.comment || "").trim() || null;
  let message = "Đã cập nhật Risk Register.";
  let transaction: "direct" | "legacy-fallback" = "direct";
  const now = new Date().toISOString();
  const today = hcmDate();

  if (command === "ASSESS") {
    if (!["IDENTIFIED", "ASSESSED", "REASSESSMENT", "MONITORING"].includes(oldStatus)) return NextResponse.json({ error: "Rủi ro không ở trạng thái có thể đánh giá." }, { status: 409 });
    const severity = Number(body.severity);
    const likelihood = Number(body.likelihood);
    const { data: matrices, error: matrixError } = await admin
      .from("risk_matrix_versions")
      .select("id,name,version_no,effective_from,effective_to,severity_scale_max,likelihood_scale_max,published_at")
      .eq("status", "PUBLISHED")
      .order("published_at", { ascending: false })
      .limit(50);
    if (matrixError) return NextResponse.json({ error: matrixError.message }, { status: 400 });
    const matrixRows: any[] = matrices || [];
    const matrix = matrixRows.find((x: any) => (!x.effective_from || x.effective_from <= today) && (!x.effective_to || x.effective_to >= today)) || matrixRows[0];
    if (!matrix) return NextResponse.json({ error: "Chưa có Risk Matrix đã phát hành. Không được nhập điểm thủ công." }, { status: 409 });
    if (!Number.isInteger(severity) || severity < 1 || severity > Number(matrix.severity_scale_max)) return NextResponse.json({ error: `Severity phải từ 1 đến ${matrix.severity_scale_max}.` }, { status: 400 });
    if (!Number.isInteger(likelihood) || likelihood < 1 || likelihood > Number(matrix.likelihood_scale_max)) return NextResponse.json({ error: `Likelihood phải từ 1 đến ${matrix.likelihood_scale_max}.` }, { status: 400 });

    const { data: cell, error: cellError } = await admin
      .from("risk_matrix_cells")
      .select("score,risk_level")
      .eq("matrix_version_id", matrix.id)
      .eq("severity_value", severity)
      .eq("likelihood_value", likelihood)
      .maybeSingle();
    if (cellError) return NextResponse.json({ error: cellError.message }, { status: 400 });
    if (!cell) return NextResponse.json({ error: "Risk Matrix chưa cấu hình ô Severity × Likelihood này." }, { status: 409 });

    const assessmentType = oldStatus === "IDENTIFIED" ? "INITIAL" : oldStatus === "REASSESSMENT" ? "POST_TREATMENT" : oldStatus === "MONITORING" ? "PERIODIC_REVIEW" : "CURRENT";
    const { error: assessmentError } = await admin.from("risk_assessments").insert({
      risk_id: risk.id,
      assessment_date: today,
      assessment_year: record.work_year,
      assessment_type: assessmentType,
      matrix_version_id: matrix.id,
      severity,
      likelihood,
      calculated_score: cell.score,
      calculated_level: cell.risk_level,
      assessed_by: auth.user.id,
      rationale: String(body.rationale || "").trim() || null,
      evidence_summary: String(body.evidence_summary || "").trim() || null,
    });
    if (assessmentError) return NextResponse.json({ error: assessmentError.message }, { status: 400 });
    newStatus = oldStatus === "REASSESSMENT" || oldStatus === "MONITORING" ? "MONITORING" : "ASSESSED";
    const { error: updateError } = await admin.from("risks").update({ workflow_status: newStatus, updated_at: now }).eq("id", risk.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    reason = reason || `Đánh giá theo ${matrix.name} v${matrix.version_no}: S=${severity}, L=${likelihood}, score=${cell.score}, level=${cell.risk_level}.`;
    message = oldStatus === "REASSESSMENT" ? "Đã lưu residual risk và chuyển sang theo dõi." : oldStatus === "MONITORING" ? "Đã lưu đánh giá định kỳ." : "Đã lưu đánh giá rủi ro.";
  } else if (command === "REQUIRE_TREATMENT") {
    if (!["ASSESSED", "MONITORING", "RISK_ACCEPTED"].includes(oldStatus)) return NextResponse.json({ error: "Rủi ro chưa ở bước có thể yêu cầu xử lý." }, { status: 409 });
    newStatus = "TREATMENT_REQUIRED";
    const { error } = await admin.from("risks").update({ workflow_status: newStatus, updated_at: now }).eq("id", risk.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    reason = reason || "Yêu cầu lập hoặc triển khai Action xử lý rủi ro.";
    message = "Đã chuyển sang bước cần xử lý.";
  } else if (command === "START_TREATMENT" || command === "REQUEST_REASSESSMENT") {
    const requiredStatus = command === "START_TREATMENT" ? "TREATMENT_REQUIRED" : "IN_TREATMENT";
    if (oldStatus !== requiredStatus) return NextResponse.json({ error: "Trạng thái Risk Register không phù hợp với thao tác này." }, { status: 409 });
    const { data: links, error: linkError } = await admin.from("risk_action_links").select("action_id").eq("risk_id", risk.id);
    if (linkError) return NextResponse.json({ error: linkError.message }, { status: 400 });
    const actionIds = (links || []).map((x: any) => x.action_id).filter(Boolean);
    if (!actionIds.length) return NextResponse.json({ error: "Cần có ít nhất 01 Action xử lý rủi ro." }, { status: 409 });
    const { data: actions, error: actionError } = await admin.from("actions").select("id,workflow_status").in("id", actionIds);
    if (actionError) return NextResponse.json({ error: actionError.message }, { status: 400 });
    const active = (actions || []).filter((x: any) => !["CANCELLED", "NOT_APPLICABLE"].includes(String(x.workflow_status)));
    if (!active.length) return NextResponse.json({ error: "Không có Action xử lý đang áp dụng." }, { status: 409 });

    if (command === "START_TREATMENT") {
      newStatus = "IN_TREATMENT";
      const { error } = await admin.from("risks").update({ workflow_status: newStatus, updated_at: now }).eq("id", risk.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      message = "Đã bắt đầu triển khai xử lý rủi ro.";
    } else {
      const incomplete = active.filter((x: any) => String(x.workflow_status) !== "COMPLETED");
      if (incomplete.length) return NextResponse.json({ error: `Còn ${incomplete.length} Action chưa hoàn thành.` }, { status: 409 });
      const { count, error: evidenceError } = await admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId);
      if (evidenceError) return NextResponse.json({ error: evidenceError.message }, { status: 400 });
      if (!count) return NextResponse.json({ error: "Cần ít nhất 01 minh chứng xử lý trước khi đánh giá residual risk." }, { status: 409 });
      newStatus = "REASSESSMENT";
      const { error } = await admin.from("risks").update({ workflow_status: newStatus, updated_at: now }).eq("id", risk.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      reason = reason || "Action đã hoàn thành và có minh chứng; chuyển đánh giá residual risk.";
      message = "Đã chuyển sang đánh giá residual risk.";
    }
  } else if (command === "ACCEPT") {
    if (!["ASSESSED", "MONITORING"].includes(oldStatus)) return NextResponse.json({ error: "Rủi ro chưa ở bước có thể ra quyết định." }, { status: 409 });
    const decision = String(body.decision || "").toUpperCase();
    if (!ACCEPT_DECISIONS.includes(decision)) return NextResponse.json({ error: "Quyết định không hợp lệ." }, { status: 400 });
    const acceptanceReason = String(body.acceptance_reason || "").trim();
    const nextReviewDate = body.next_review_date ? String(body.next_review_date) : null;
    if (!acceptanceReason) return NextResponse.json({ error: "Lý do quyết định là bắt buộc." }, { status: 400 });
    if (decision === "ACCEPT_WITH_MONITORING" && !nextReviewDate) return NextResponse.json({ error: "Cần ngày rà soát tiếp theo." }, { status: 400 });
    if (nextReviewDate && nextReviewDate < today) return NextResponse.json({ error: "Ngày rà soát tiếp theo không được ở quá khứ." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(ACCEPT_RISK_RPC, {
      p_risk_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_decision: decision,
      p_acceptance_reason: acceptanceReason,
      p_next_review_date: nextReviewDate,
    });
    if (!txError) {
      const status = typeof tx === "object" && tx && "status" in tx ? String((tx as Record<string, unknown>).status || "") : decision === "ACCEPT" ? "RISK_ACCEPTED" : decision === "ACCEPT_WITH_MONITORING" ? "MONITORING" : "TREATMENT_REQUIRED";
      return NextResponse.json({ ok: true, status, message: decision === "ACCEPT" ? "Đã chấp nhận rủi ro." : decision === "ACCEPT_WITH_MONITORING" ? "Đã chấp nhận có theo dõi." : "Đã chuyển lại bước xử lý.", transaction: "atomic", result: tx });
    }
    if (!isMissingRpcFunction(txError, ACCEPT_RISK_RPC)) {
      const txMessage = rpcErrorMessage(txError, "Không thể ghi nhận quyết định rủi ro.");
      return NextResponse.json({ error: txMessage }, { status: /not active|decision gate|required|past|invalid/i.test(txMessage) ? 409 : 400 });
    }

    transaction = "legacy-fallback";
    const { data: assessment, error: assessmentError } = await admin.from("risk_assessments").select("id").eq("risk_id", risk.id).order("assessment_date", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (assessmentError) return NextResponse.json({ error: assessmentError.message }, { status: 400 });
    if (!assessment) return NextResponse.json({ error: "Chưa có đánh giá rủi ro làm căn cứ quyết định." }, { status: 409 });
    const { data: acceptance, error: acceptError } = await admin.from("risk_acceptances").insert({ risk_id: risk.id, risk_assessment_id: assessment.id, decision, accepted_by: auth.user.id, acceptance_reason: acceptanceReason, next_review_date: nextReviewDate }).select("id").single();
    if (acceptError || !acceptance) return NextResponse.json({ error: acceptError?.message || "Không lưu được quyết định rủi ro." }, { status: 400 });

    newStatus = decision === "ACCEPT" ? "RISK_ACCEPTED" : decision === "ACCEPT_WITH_MONITORING" ? "MONITORING" : "TREATMENT_REQUIRED";
    const { error } = await admin.from("risks").update({ workflow_status: newStatus, next_review_date: nextReviewDate || risk.next_review_date, updated_at: now }).eq("id", risk.id);
    if (error) {
      await admin.from("risk_acceptances").delete().eq("id", acceptance.id);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    reason = acceptanceReason;
    message = decision === "ACCEPT" ? "Đã chấp nhận rủi ro." : decision === "ACCEPT_WITH_MONITORING" ? "Đã chấp nhận có theo dõi." : "Đã chuyển lại bước xử lý.";
  } else if (command === "RETIRE") {
    if (!["RISK_ACCEPTED", "MONITORING"].includes(oldStatus)) return NextResponse.json({ error: "Chỉ rủi ro đã chấp nhận hoặc đang theo dõi mới được retire." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Lý do retire là bắt buộc." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(RETIRE_RISK_RPC, {
      p_risk_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });
    if (!txError) return NextResponse.json({ ok: true, status: "RETIRED", message: "Đã retire rủi ro; lịch sử vẫn được giữ để truy vết.", transaction: "atomic", result: tx });
    if (!isMissingRpcFunction(txError, RETIRE_RISK_RPC)) {
      const txMessage = rpcErrorMessage(txError, "Không thể retire rủi ro.");
      return NextResponse.json({ error: txMessage }, { status: /not active|not eligible|required/i.test(txMessage) ? 409 : 400 });
    }

    transaction = "legacy-fallback";
    newStatus = "RETIRED";
    const { error: riskUpdateError } = await admin.from("risks").update({ workflow_status: newStatus, retired_at: now, retired_reason: reason, updated_at: now }).eq("id", risk.id);
    if (riskUpdateError) return NextResponse.json({ error: riskUpdateError.message }, { status: 400 });
    const { error: recordUpdateError } = await admin.from("records").update({ lifecycle_status: "RETIRED", closed_at: now, updated_at: now }).eq("id", recordId);
    if (recordUpdateError) {
      await admin.from("risks").update({ workflow_status: oldStatus, retired_at: null, retired_reason: null, updated_at: now }).eq("id", risk.id);
      return NextResponse.json({ error: recordUpdateError.message }, { status: 400 });
    }
    const { error: historyError } = await admin.from("record_status_history").insert({ record_id: recordId, old_status: record.lifecycle_status, new_status: "RETIRED", changed_by: auth.user.id, reason });
    if (historyError) {
      await admin.from("records").update({ lifecycle_status: record.lifecycle_status, closed_at: null, updated_at: now }).eq("id", recordId);
      await admin.from("risks").update({ workflow_status: oldStatus, retired_at: null, retired_reason: null, updated_at: now }).eq("id", risk.id);
      return NextResponse.json({ error: historyError.message }, { status: 400 });
    }
    message = "Đã retire rủi ro; lịch sử vẫn được giữ để truy vết.";
  } else {
    return NextResponse.json({ error: "Thao tác Risk Register không hợp lệ." }, { status: 400 });
  }

  await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "risks", row_id: risk.id, action_type: `RISK_${command}`, old_value: { workflow_status: oldStatus }, new_value: { workflow_status: newStatus }, reason, request_meta: { source: "qlcl-ui", transaction } });

  return NextResponse.json({ ok: true, status: newStatus, message, transaction });
}
