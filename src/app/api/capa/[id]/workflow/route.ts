import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { notifyWorkflowEvent } from "@/lib/workflow-notifications";

const validReview = new Set(["EFFECTIVE", "PARTIALLY_EFFECTIVE", "INEFFECTIVE"]);
const CLOSE_RPC = "qlcl_close_capa_v1";
const REQUEST_EFFECTIVENESS_RPC = "qlcl_request_capa_effectiveness_v1";
const REVIEW_EFFECTIVENESS_RPC = "qlcl_review_capa_effectiveness_v1";
const SAVE_RCA_RPC = "qlcl_save_capa_rca_v1";
const START_ACTIONS_RPC = "qlcl_start_capa_actions_v1";
const CORE_TRANSITION_RPC = "qlcl_transition_capa_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "capa.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền quản lý CAPA." }, { status: 403 });
  const { id: recordId } = await params;
  const body: any = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const { data: visible } = await supabase.from("records").select("id,lifecycle_status,owner_user_id").eq("id", recordId).eq("record_type", "CAPA").maybeSingle();
  if (!visible) return NextResponse.json({ error: "Không tìm thấy CAPA hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (visible.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "CAPA không còn hoạt động." }, { status: 409 });

  const admin: any = createAdminClient();
  const { data: capa, error } = await admin.from("capas").select("id,workflow_status,approval_required,rca_analysis_id,effectiveness_due_date,required_resources").eq("record_id", recordId).maybeSingle();
  if (error || !capa) return NextResponse.json({ error: error?.message || "Không tìm thấy dữ liệu CAPA." }, { status: 404 });
  const oldStatus = String(capa.workflow_status || "DRAFT");
  const reason = String(body.comment || "").trim() || null;

  if (command === "START" || command === "APPROVE") {
    const { data: tx, error: txError } = await admin.rpc(CORE_TRANSITION_RPC, {
      p_capa_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_command: command,
      p_required_resources: null,
      p_reason: reason,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, command === "START" ? "Không thể bắt đầu CAPA." : "Không thể phê duyệt CAPA.");
      return NextResponse.json({ error: txMessage }, { status: 409 });
    }
    const workflowStatus = tx?.workflow_status ?? (command === "START"
      ? (capa.approval_required ? "PENDING_APPROVAL" : "ROOT_CAUSE_ANALYSIS")
      : "ROOT_CAUSE_ANALYSIS");
    return NextResponse.json({
      ok: true,
      status: workflowStatus,
      message: command === "START"
        ? (workflowStatus === "PENDING_APPROVAL" ? "Đã gửi CAPA chờ phê duyệt." : "Đã chuyển sang phân tích nguyên nhân gốc.")
        : "Đã phê duyệt CAPA.",
      transaction: "atomic",
      result: tx,
    });
  } else if (command === "SAVE_RCA") {
    const method = String(body.method || "").trim();
    const conclusion = String(body.conclusion || "").trim();
    if (!method || !conclusion) {
      return NextResponse.json({ error: "Phương pháp và kết luận nguyên nhân gốc là bắt buộc." }, { status: 400 });
    }
    const { data: tx, error: txError } = await admin.rpc(SAVE_RCA_RPC, {
      p_capa_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_method: method,
      p_conclusion: conclusion,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể lưu phân tích nguyên nhân gốc.");
      return NextResponse.json({ error: txMessage }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      status: tx?.workflow_status ?? "ROOT_CAUSE_ANALYSIS",
      message: "Đã lưu phân tích nguyên nhân gốc.",
      transaction: "atomic",
      result: tx,
    });
  } else if (command === "START_ACTIONS") {
    const { data: tx, error: txError } = await admin.rpc(START_ACTIONS_RPC, {
      p_capa_record_id: recordId,
      p_actor_user_id: auth.user.id,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể bắt đầu triển khai Action của CAPA.");
      return NextResponse.json({ error: txMessage }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      status: tx?.workflow_status ?? "IN_PROGRESS",
      message: "Đã bắt đầu triển khai CAPA.",
      transaction: "atomic",
      result: tx,
    });
  } else if (command === "REQUEST_EFFECTIVENESS") {
    const { data: tx, error: txError } = await admin.rpc(REQUEST_EFFECTIVENESS_RPC, {
      p_capa_record_id: recordId,
      p_actor_user_id: auth.user.id,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể chuyển CAPA sang đánh giá hiệu lực.");
      return NextResponse.json({ error: txMessage }, { status: 409 });
    }
    await notifyWorkflowEvent({
      admin,
      recordId,
      recipientUserIds: [visible.owner_user_id],
      eventKey: `capa:${capa.id}:EFFECTIVENESS_REVIEW`,
      notificationType: "CAPA_EFFECTIVENESS_REVIEW",
      priority: "HIGH",
      title: "CAPA chờ đánh giá hiệu lực",
      message: "CAPA đã đủ điều kiện và chuyển sang bước đánh giá hiệu lực.",
    });
    return NextResponse.json({
      ok: true,
      status: tx?.workflow_status ?? "EFFECTIVENESS_REVIEW",
      message: "Đã chuyển sang đánh giá hiệu lực.",
      transaction: "atomic",
      result: tx,
    });
  } else if (command === "REVIEW_EFFECTIVENESS") {
    const result=String(body.result||"").toUpperCase();
    const method=String(body.evaluation_method||"").trim();
    const target=String(body.target_description||"").trim();
    const actual=String(body.actual_result||"").trim();
    if(!validReview.has(result)||!method||!target||!actual) {
      return NextResponse.json({error:"Cần đủ phương pháp, mục tiêu, kết quả thực tế và kết luận hiệu lực."},{status:400});
    }
    const { data: tx, error: txError } = await admin.rpc(REVIEW_EFFECTIVENESS_RPC, {
      p_capa_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_result: result,
      p_evaluation_method: method,
      p_target_description: target,
      p_actual_result: actual,
      p_comment: reason,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể lưu đánh giá hiệu lực.");
      return NextResponse.json({ error: txMessage }, { status: 409 });
    }
    const reviewedStatus = tx?.workflow_status ?? (result === "EFFECTIVE" ? "EFFECTIVE" : "IN_PROGRESS");
    return NextResponse.json({
      ok: true,
      status: reviewedStatus,
      message: result === "EFFECTIVE" ? "CAPA được xác nhận có hiệu lực." : "CAPA chưa đạt hiệu lực; đã mở lại bước triển khai.",
      transaction: "atomic",
      result: tx,
    });
  } else if (command === "SET_RESOURCES") {
    const resources = String(body.required_resources || "").trim();
    if (!resources) return NextResponse.json({ error: "Cần mô tả nguồn lực cần (nhân lực, kinh phí, thiết bị...)." }, { status: 400 });
    const { data: tx, error: txError } = await admin.rpc(CORE_TRANSITION_RPC, {
      p_capa_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_command: "SET_RESOURCES",
      p_required_resources: resources,
      p_reason: reason,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể cập nhật nguồn lực cần cho CAPA.");
      return NextResponse.json({ error: txMessage }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      status: tx?.workflow_status ?? oldStatus,
      message: "Đã lưu nguồn lực cần.",
      transaction: "atomic",
      result: tx,
    });
  } else if (command === "CLOSE") {
    if(oldStatus!=="EFFECTIVE")return NextResponse.json({error:"Chỉ CAPA đã xác nhận có hiệu lực mới được đóng."},{status:409});
    const closeReason = reason || "CAPA đã được xác nhận hiệu lực.";
    const { data: tx, error: txError } = await admin.rpc(CLOSE_RPC, {
      p_capa_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: closeReason,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể đóng CAPA.");
      return NextResponse.json({ error: txMessage }, { status: /not active|only effective|not found/i.test(txMessage) ? 409 : 400 });
    }
    return NextResponse.json({ ok: true, status: "CLOSED", message: "Đã đóng CAPA sau xác minh hiệu lực.", transaction: "atomic", result: tx });
  } else return NextResponse.json({ error: "Thao tác CAPA không hợp lệ." }, { status: 400 });
}
