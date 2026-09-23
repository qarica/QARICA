import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { notifyWorkflowEvent } from "@/lib/workflow-notifications";

const validReview = new Set(["EFFECTIVE", "PARTIALLY_EFFECTIVE", "INEFFECTIVE"]);
const CLOSE_RPC = "qlcl_close_capa_v1";
const REQUEST_EFFECTIVENESS_RPC = "qlcl_request_capa_effectiveness_v1";
const REVIEW_EFFECTIVENESS_RPC = "qlcl_review_capa_effectiveness_v1";

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
  const now = new Date().toISOString();
  let newStatus = oldStatus; let reason = String(body.comment || "").trim() || null; let message = "Đã cập nhật CAPA.";

  if (command === "START") {
    if (oldStatus !== "DRAFT") return NextResponse.json({ error: "Chỉ CAPA nháp mới được bắt đầu." }, { status: 409 });
    newStatus = capa.approval_required ? "PENDING_APPROVAL" : "ROOT_CAUSE_ANALYSIS";
    const { error: updateError } = await admin.from("capas").update({ workflow_status: newStatus, updated_at: now }).eq("id", capa.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    message = capa.approval_required ? "Đã gửi CAPA chờ phê duyệt." : "Đã chuyển sang phân tích nguyên nhân gốc.";
  } else if (command === "APPROVE") {
    if (oldStatus !== "PENDING_APPROVAL") return NextResponse.json({ error: "CAPA không ở trạng thái chờ phê duyệt." }, { status: 409 });
    newStatus = "ROOT_CAUSE_ANALYSIS";
    const { error: updateError } = await admin.from("capas").update({ workflow_status: newStatus, approved_at: now, approved_by: auth.user.id, updated_at: now }).eq("id", capa.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    reason = reason || "CAPA được phê duyệt để phân tích nguyên nhân và triển khai."; message = "Đã phê duyệt CAPA.";
  } else if (command === "SAVE_RCA") {
    if (oldStatus !== "ROOT_CAUSE_ANALYSIS") return NextResponse.json({ error: "CAPA không ở bước phân tích nguyên nhân." }, { status: 409 });
    const method = String(body.method || "").trim(); const conclusion = String(body.conclusion || "").trim();
    if (!method || !conclusion) return NextResponse.json({ error: "Phương pháp và kết luận nguyên nhân gốc là bắt buộc." }, { status: 400 });
    let rcaId = capa.rca_analysis_id;
    if (rcaId) {
      const { error: rcaError } = await admin.from("rca_analyses").update({ method, status: "COMPLETED", completed_at: now, conclusion }).eq("id", rcaId);
      if (rcaError) return NextResponse.json({ error: rcaError.message }, { status: 400 });
    } else {
      const { data: rca, error: rcaError } = await admin.from("rca_analyses").insert({ method, status: "COMPLETED", started_at: now, completed_at: now, conclusion }).select("id").single();
      if (rcaError || !rca) return NextResponse.json({ error: rcaError?.message || "Không lưu được RCA." }, { status: 400 });
      rcaId = rca.id;
      const { error: linkError } = await admin.from("capas").update({ rca_analysis_id: rcaId, updated_at: now }).eq("id", capa.id);
      if (linkError) {
        await admin.from("rca_analyses").delete().eq("id", rcaId);
        return NextResponse.json({ error: linkError.message }, { status: 400 });
      }
    }
    reason = `Hoàn tất RCA bằng ${method}.`; message = "Đã lưu phân tích nguyên nhân gốc.";
  } else if (command === "START_ACTIONS") {
    if (oldStatus !== "ROOT_CAUSE_ANALYSIS") return NextResponse.json({ error: "CAPA chưa ở bước lập hành động." }, { status: 409 });
    if (!capa.rca_analysis_id) return NextResponse.json({ error: "Phải hoàn tất phân tích nguyên nhân gốc trước." }, { status: 409 });
    const { data: rca } = await admin.from("rca_analyses").select("status,conclusion").eq("id", capa.rca_analysis_id).maybeSingle();
    if (rca?.status !== "COMPLETED" || !String(rca.conclusion || "").trim()) return NextResponse.json({ error: "RCA chưa hoàn tất hoặc chưa có kết luận." }, { status: 409 });
    const { data: links } = await admin.from("capa_action_links").select("action_id,action_type").eq("capa_id", capa.id);
    const activeTypes = new Set((links || []).map((x:any) => String(x.action_type)));
    if (!activeTypes.has("CORRECTIVE") || !activeTypes.has("PREVENTIVE")) return NextResponse.json({ error: "CAPA cần ít nhất 01 Corrective Action và 01 Preventive Action." }, { status: 409 });
    newStatus = "IN_PROGRESS";
    const { error: updateError } = await admin.from("capas").update({ workflow_status: newStatus, updated_at: now }).eq("id", capa.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    message = "Đã bắt đầu triển khai CAPA.";
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
    if (oldStatus === "CLOSED") return NextResponse.json({ error: "CAPA đã đóng, không thể sửa nguồn lực cần." }, { status: 409 });
    const resources = String(body.required_resources || "").trim();
    if (!resources) return NextResponse.json({ error: "Cần mô tả nguồn lực cần (nhân lực, kinh phí, thiết bị...)." }, { status: 400 });
    const { error: updateError } = await admin.from("capas").update({ required_resources: resources, updated_at: now }).eq("id", capa.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    reason = reason || "Cập nhật nguồn lực cần cho CAPA."; message = "Đã lưu nguồn lực cần.";
  } else if (command === "CLOSE") {
    if(oldStatus!=="EFFECTIVE")return NextResponse.json({error:"Chỉ CAPA đã xác nhận có hiệu lực mới được đóng."},{status:409});
    reason = reason || "CAPA đã được xác nhận hiệu lực.";
    const { data: tx, error: txError } = await admin.rpc(CLOSE_RPC, {
      p_capa_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể đóng CAPA.");
      return NextResponse.json({ error: txMessage }, { status: /not active|only effective|not found/i.test(txMessage) ? 409 : 400 });
    }
    return NextResponse.json({ ok: true, status: "CLOSED", message: "Đã đóng CAPA sau xác minh hiệu lực.", transaction: "atomic", result: tx });
  } else return NextResponse.json({ error: "Thao tác CAPA không hợp lệ." }, { status: 400 });

  await admin.from("audit_logs").insert({ actor_user_id:auth.user.id,record_id:recordId,table_name:"capas",row_id:capa.id,action_type:`CAPA_${command}`,old_value:{workflow_status:oldStatus},new_value:{workflow_status:newStatus},reason,request_meta:{source:"qlcl-ui"} });
  return NextResponse.json({ok:true,status:newStatus,message,transaction:"direct"});
}
