import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const TERMINAL = ["CANCELLED", "ARCHIVED", "INACTIVE", "RETIRED"];
const ACCEPT_DECISIONS = ["ACCEPT", "ACCEPT_WITH_MONITORING", "NOT_ACCEPTED", "ESCALATE"];
const ASSESS_RISK_RPC = "qlcl_assess_risk_v1";
const TRANSITION_RISK_RPC = "qlcl_transition_risk_v1";
const ACCEPT_RISK_RPC = "qlcl_accept_risk_v1";
const RETIRE_RISK_RPC = "qlcl_retire_risk_v1";
const NON_TERMINAL_COMMANDS = new Set(["REQUIRE_TREATMENT", "START_TREATMENT", "REQUEST_REASSESSMENT"]);

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
    .select("id,lifecycle_status")
    .eq("id", recordId)
    .eq("record_type", "RISK")
    .maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy rủi ro hoặc bạn không có quyền truy cập." }, { status: 404 });
  if (TERMINAL.includes(String(record.lifecycle_status))) {
    return NextResponse.json({ error: "Hồ sơ rủi ro đã ngưng hoạt động." }, { status: 409 });
  }

  const admin: any = createAdminClient();
  const { data: risk, error: riskError } = await admin
    .from("risks")
    .select("id,workflow_status")
    .eq("record_id", recordId)
    .maybeSingle();
  if (riskError) return NextResponse.json({ error: riskError.message }, { status: 400 });
  if (!risk) return NextResponse.json({ error: "Không tìm thấy dữ liệu Risk Register." }, { status: 404 });

  const oldStatus = String(risk.workflow_status || "IDENTIFIED");
  const reason = String(body.comment || "").trim() || null;

  if (command === "ASSESS") {
    const severity = Number(body.severity);
    const likelihood = Number(body.likelihood);
    if (!Number.isInteger(severity) || !Number.isInteger(likelihood)) {
      return NextResponse.json({ error: "Severity và Likelihood phải là số nguyên." }, { status: 400 });
    }

    const { data: tx, error: txError } = await admin.rpc(ASSESS_RISK_RPC, {
      p_risk_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_severity: severity,
      p_likelihood: likelihood,
      p_rationale: String(body.rationale || "").trim() || null,
      p_evidence_summary: String(body.evidence_summary || "").trim() || null,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể lưu đánh giá rủi ro.");
      return NextResponse.json(
        { error: txMessage },
        { status: /không|chưa|phải từ|matrix|trạng thái|ngoài phạm vi/i.test(txMessage) ? 409 : 400 },
      );
    }

    const newStatus = tx?.workflow_status || (oldStatus === "REASSESSMENT" || oldStatus === "MONITORING" ? "MONITORING" : "ASSESSED");
    return NextResponse.json({
      ok: true,
      status: newStatus,
      message: oldStatus === "REASSESSMENT"
        ? "Đã lưu residual risk và chuyển sang theo dõi."
        : oldStatus === "MONITORING"
          ? "Đã lưu đánh giá định kỳ."
          : "Đã lưu đánh giá rủi ro.",
      transaction: "atomic",
      result: tx,
    });
  }

  if (NON_TERMINAL_COMMANDS.has(command)) {
    const { data: tx, error: txError } = await admin.rpc(TRANSITION_RISK_RPC, {
      p_risk_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_command: command,
      p_reason: reason,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể cập nhật vòng xử lý rủi ro.");
      return NextResponse.json(
        { error: txMessage },
        { status: /không|chưa|còn|cần|trạng thái|ngoài phạm vi/i.test(txMessage) ? 409 : 400 },
      );
    }

    const message =
      command === "REQUIRE_TREATMENT" ? "Đã chuyển sang bước cần xử lý." :
      command === "START_TREATMENT" ? "Đã bắt đầu triển khai xử lý rủi ro." :
      "Đã chuyển sang đánh giá residual risk.";

    return NextResponse.json({
      ok: true,
      status: tx?.workflow_status,
      message,
      transaction: "atomic",
      result: tx,
    });
  }

  if (command === "ACCEPT") {
    if (!["ASSESSED", "MONITORING"].includes(oldStatus)) {
      return NextResponse.json({ error: "Rủi ro chưa ở bước có thể ra quyết định." }, { status: 409 });
    }
    const decision = String(body.decision || "").toUpperCase();
    if (!ACCEPT_DECISIONS.includes(decision)) return NextResponse.json({ error: "Quyết định không hợp lệ." }, { status: 400 });
    const acceptanceReason = String(body.acceptance_reason || "").trim();
    const nextReviewDate = body.next_review_date ? String(body.next_review_date) : null;
    if (!acceptanceReason) return NextResponse.json({ error: "Lý do quyết định là bắt buộc." }, { status: 400 });
    if (decision === "ACCEPT_WITH_MONITORING" && !nextReviewDate) {
      return NextResponse.json({ error: "Cần ngày rà soát tiếp theo." }, { status: 400 });
    }
    if (nextReviewDate && nextReviewDate < hcmDate()) {
      return NextResponse.json({ error: "Ngày rà soát tiếp theo không được ở quá khứ." }, { status: 400 });
    }

    const { data: tx, error: txError } = await admin.rpc(ACCEPT_RISK_RPC, {
      p_risk_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_decision: decision,
      p_acceptance_reason: acceptanceReason,
      p_next_review_date: nextReviewDate,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể ghi nhận quyết định rủi ro.");
      return NextResponse.json({ error: txMessage }, { status: /not active|decision gate|required|past|invalid/i.test(txMessage) ? 409 : 400 });
    }
    const status = typeof tx === "object" && tx && "status" in tx
      ? String((tx as Record<string, unknown>).status || "")
      : decision === "ACCEPT"
        ? "RISK_ACCEPTED"
        : decision === "ACCEPT_WITH_MONITORING"
          ? "MONITORING"
          : "TREATMENT_REQUIRED";
    return NextResponse.json({
      ok: true,
      status,
      message: decision === "ACCEPT"
        ? "Đã chấp nhận rủi ro."
        : decision === "ACCEPT_WITH_MONITORING"
          ? "Đã chấp nhận có theo dõi."
          : "Đã chuyển lại bước xử lý.",
      transaction: "atomic",
      result: tx,
    });
  }

  if (command === "RETIRE") {
    if (!["RISK_ACCEPTED", "MONITORING"].includes(oldStatus)) {
      return NextResponse.json({ error: "Chỉ rủi ro đã chấp nhận hoặc đang theo dõi mới được retire." }, { status: 409 });
    }
    if (!reason) return NextResponse.json({ error: "Lý do retire là bắt buộc." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(RETIRE_RISK_RPC, {
      p_risk_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể retire rủi ro.");
      return NextResponse.json({ error: txMessage }, { status: /not active|not eligible|required/i.test(txMessage) ? 409 : 400 });
    }
    return NextResponse.json({
      ok: true,
      status: "RETIRED",
      message: "Đã retire rủi ro; lịch sử vẫn được giữ để truy vết.",
      transaction: "atomic",
      result: tx,
    });
  }

  return NextResponse.json({ error: "Thao tác Risk Register không hợp lệ." }, { status: 400 });
}
