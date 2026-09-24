import { NextResponse } from "next/server";
import { arePdsaMilestonesComplete, normalizeProjectMilestone } from "@/lib/improvement-project-setup";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const CLOSE_PROJECT_RPC = "qlcl_close_improvement_project_v1";
const TRANSITION_PROJECT_RPC = "qlcl_transition_improvement_project_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "projects.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền quản lý đề án." }, { status: 403 });

  const { id: recordId } = await params;
  const body: any = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const { data: record } = await supabase
    .from("records")
    .select("id,lifecycle_status,closed_at,updated_at")
    .eq("id", recordId)
    .eq("record_type", "IMPROVEMENT_PROJECT")
    .maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy đề án hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Đề án không còn hoạt động." }, { status: 409 });

  const admin: any = createAdminClient();
  const { data: project, error } = await admin
    .from("improvement_projects")
    .select("id,workflow_status,problem_statement,start_date,target_end_date,scope_description,approved_at,actual_end_date,updated_at")
    .eq("record_id", recordId)
    .maybeSingle();
  if (error || !project) return NextResponse.json({ error: error?.message || "Không tìm thấy dữ liệu đề án." }, { status: 404 });

  const oldStatus = String(project.workflow_status || "DRAFT");
  const reason = String(body.comment || "").trim() || null;
  let newStatus = oldStatus;
  let message = "Đã cập nhật đề án.";

  const [{ count: objectives }, { count: milestones }, { data: links }, { count: evidence }] = await Promise.all([
    admin.from("project_objectives").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    admin.from("project_milestones").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    admin.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "HAS_ACTION"),
    admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId),
  ]);

  if (command === "SUBMIT") {
    if (oldStatus !== "DRAFT") return NextResponse.json({ error: "Chỉ đề án nháp mới được gửi phê duyệt." }, { status: 409 });
    if (!String(project.problem_statement || "").trim() || !String(project.scope_description || "").trim() || !project.start_date || !project.target_end_date) return NextResponse.json({ error: "Thiếu vấn đề, phạm vi hoặc thời gian đề án." }, { status: 409 });
    if (!objectives || !milestones) return NextResponse.json({ error: "Cần ít nhất 01 mục tiêu SMART và 01 milestone/PDSA." }, { status: 409 });
    newStatus = "PENDING_APPROVAL"; message = "Đã gửi đề án phê duyệt.";
  } else if (command === "APPROVE") {
    if (oldStatus !== "PENDING_APPROVAL") return NextResponse.json({ error: "Đề án chưa ở bước chờ phê duyệt." }, { status: 409 });
    newStatus = "APPROVED"; message = "Đã phê duyệt đề án.";
  } else if (command === "START") {
    if (oldStatus !== "APPROVED") return NextResponse.json({ error: "Đề án chưa được phê duyệt." }, { status: 409 });
    newStatus = "IN_PROGRESS"; message = "Đã bắt đầu triển khai đề án/PDSA.";
  } else if (command === "EVALUATE") {
    if (oldStatus !== "IN_PROGRESS") return NextResponse.json({ error: "Đề án chưa ở bước triển khai." }, { status: 409 });
    const { data: milestoneRows, error: milestoneError } = await admin.from("project_milestones").select("*").eq("project_id", project.id);
    if (milestoneError) return NextResponse.json({ error: milestoneError.message }, { status: 400 });
    const milestoneStatuses: string[] = (milestoneRows || []).map((row: any, index: number) => normalizeProjectMilestone(row, index).status);
    if (!arePdsaMilestonesComplete(milestoneStatuses)) return NextResponse.json({ error: `Còn ${milestoneStatuses.filter((status:string)=>status!=="COMPLETED").length || milestoneStatuses.length || 1} milestone PDSA chưa hoàn thành.` }, { status: 409 });
    const ids=(links||[]).map((x:any)=>x.target_record_id).filter(Boolean); if(!ids.length)return NextResponse.json({error:"Cần Action/can thiệp trước khi đánh giá."},{status:409});
    const {data:actions}=await admin.from("actions").select("workflow_status").in("record_id",ids); const incomplete=(actions||[]).filter((x:any)=>!["COMPLETED","CANCELLED","NOT_APPLICABLE"].includes(String(x.workflow_status))).length;
    if(incomplete)return NextResponse.json({error:`Còn ${incomplete} Action chưa hoàn thành.`},{status:409}); if(!evidence)return NextResponse.json({error:"Cần minh chứng và dữ liệu kết quả trước-sau."},{status:409});
    const summary=String(body.objective_achievement_summary||"").trim(); const result=String(body.overall_result||"").toUpperCase(); if(!summary||!["ACHIEVED","PARTIAL","NOT_ACHIEVED"].includes(result))return NextResponse.json({error:"Cần kết luận mức đạt mục tiêu hợp lệ."},{status:400});
    newStatus=result==="ACHIEVED"?"EVALUATED":"IN_PROGRESS"; message=result==="ACHIEVED"?"Đã xác nhận đề án đạt mục tiêu.":"Kết quả chưa đạt đầy đủ; tiếp tục chu trình PDSA.";
  } else if (command === "CLOSE") {
    if (oldStatus !== "EVALUATED") return NextResponse.json({ error: "Chỉ đề án đã đánh giá đạt mới được đóng." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Kết luận duy trì/nhân rộng là bắt buộc." }, { status: 400 });

    const { data: tx, error: txError } = await admin.rpc(CLOSE_PROJECT_RPC, {
      p_project_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể đóng đề án cải tiến.");
      return NextResponse.json({ error: txMessage }, { status: /not active|evaluated|achieved|incomplete|required/i.test(txMessage) ? 409 : 400 });
    }
    return NextResponse.json({
      ok: true,
      status: "CLOSED",
      message: "Đã đóng đề án và giữ quyết định duy trì/nhân rộng.",
      transaction: "atomic",
      result: tx,
    });
  } else {
    return NextResponse.json({ error: "Thao tác đề án không hợp lệ." }, { status: 400 });
  }

  const { data: tx, error: txError } = await admin.rpc(TRANSITION_PROJECT_RPC, {
    p_project_record_id: recordId, p_actor_user_id: auth.user.id, p_command: command, p_reason: reason,
    p_summary: command === "EVALUATE" ? String(body.objective_achievement_summary || "").trim() : null,
    p_overall_result: command === "EVALUATE" ? String(body.overall_result || "").toUpperCase() : null,
    p_sustainability_required: !!body.sustainability_required, p_scaleout_recommended: !!body.scaleout_recommended,
  });
  if (txError) return NextResponse.json({ error: rpcErrorMessage(txError, "Không thể cập nhật đề án cải tiến.") }, { status: 409 });
  return NextResponse.json({ ok: true, status: newStatus, message, transaction: "atomic", result: tx });
}