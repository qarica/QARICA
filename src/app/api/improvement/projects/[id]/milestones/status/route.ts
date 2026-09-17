import { NextResponse } from "next/server";
import {
  existingImprovementColumn,
  isValidActDecision,
  MILESTONE_COLUMNS,
  normalizeProjectMilestone,
  pdsaMilestoneTargetStatus,
} from "@/lib/improvement-project-setup";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_ACTIONS = new Set(["START", "COMPLETE", "RESET", "REOPEN"]);
const REASON_REQUIRED = new Set(["RESET", "REOPEN"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "projects.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền quản lý đề án cải tiến." }, { status: 403 });

  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const milestoneId = String(body.milestone_id || "").trim();
  const action = String(body.action || "").trim().toUpperCase();
  const reason = String(body.reason || "").trim();
  if (!UUID_RE.test(recordId) || !UUID_RE.test(milestoneId)) return NextResponse.json({ error: "ID đề án hoặc milestone không hợp lệ." }, { status: 400 });
  if (!VALID_ACTIONS.has(action)) return NextResponse.json({ error: "Thao tác milestone không hợp lệ." }, { status: 400 });
  if (REASON_REQUIRED.has(action) && reason.length < 3) return NextResponse.json({ error: "Cần nhập lý do rõ ràng khi hoàn về dự kiến hoặc mở lại milestone." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller }, { data: record }, { data: project }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("records").select("id,organization_id,lifecycle_status").eq("id", recordId).eq("record_type", "IMPROVEMENT_PROJECT").maybeSingle(),
    admin.from("improvement_projects").select("id,workflow_status").eq("record_id", recordId).maybeSingle(),
  ]);
  if (!caller?.is_active || !caller.organization_id || !record || record.organization_id !== caller.organization_id || record.lifecycle_status !== "ACTIVE" || !project) {
    return NextResponse.json({ error: "Đề án không thuộc phạm vi bệnh viện hiện tại hoặc đã đóng." }, { status: 403 });
  }

  const { data: rawMilestone, error: milestoneError } = await admin.from("project_milestones").select("*").eq("id", milestoneId).eq("project_id", project.id).maybeSingle();
  if (milestoneError) return NextResponse.json({ error: milestoneError.message }, { status: 400 });
  if (!rawMilestone) return NextResponse.json({ error: "Không tìm thấy milestone trong đề án này." }, { status: 404 });

  const milestone = normalizeProjectMilestone(rawMilestone);
  const targetStatus = pdsaMilestoneTargetStatus(project.workflow_status, milestone.status, action);
  if (!targetStatus) return NextResponse.json({ error: `Không thể thực hiện ${action} khi đề án=${project.workflow_status} và milestone=${milestone.status}.` }, { status: 409 });

  const statusColumn = existingImprovementColumn(rawMilestone, MILESTONE_COLUMNS.status);
  if (!statusColumn) return NextResponse.json({ error: "Schema milestone hiện tại không có cột trạng thái tương thích để cập nhật an toàn." }, { status: 409 });

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { [statusColumn]: targetStatus };
  if (Object.prototype.hasOwnProperty.call(rawMilestone, "updated_at")) patch.updated_at = now;

  if (action === "COMPLETE" && milestone.phase === "STUDY") {
    const studyResult = String(body.study_result || "").trim();
    const learningSummary = String(body.learning_summary || "").trim();
    if (!studyResult || !learningSummary) return NextResponse.json({ error: "Pha STUDY chỉ được hoàn thành khi đã ghi kết quả đo lường và bài học rút ra." }, { status: 409 });
    patch.study_result = studyResult;
    patch.learning_summary = learningSummary;
  }
  if (action === "COMPLETE" && milestone.phase === "ACT") {
    const actDecision = String(body.act_decision || "").trim().toUpperCase();
    if (!isValidActDecision(actDecision)) return NextResponse.json({ error: "Pha ACT cần quyết định ADOPT, ADAPT hoặc ABANDON trước khi hoàn thành." }, { status: 409 });
    patch.act_decision = actDecision;
  }

  const rollback: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) rollback[key] = rawMilestone[key] ?? null;
  const { error: updateError } = await admin.from("project_milestones").update(patch).eq("id", milestoneId).eq("project_id", project.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  const actionReason = reason || (action === "START" ? "Bắt đầu thực hiện milestone PDSA." : "Xác nhận hoàn thành milestone PDSA.");
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    record_id: recordId,
    table_name: "project_milestones",
    row_id: milestoneId,
    action_type: `IMPROVEMENT_MILESTONE_${action}`,
    old_value: { status: milestone.status, study_result: milestone.study_result, learning_summary: milestone.learning_summary, act_decision: milestone.act_decision },
    new_value: { status: targetStatus, study_result: patch.study_result ?? milestone.study_result, learning_summary: patch.learning_summary ?? milestone.learning_summary, act_decision: patch.act_decision ?? milestone.act_decision },
    reason: actionReason,
    request_meta: { source: "qlcl-ui", project_workflow_status: project.workflow_status, pdsa_phase: milestone.phase },
  });
  if (auditError) {
    const { error: rollbackError } = await admin.from("project_milestones").update(rollback).eq("id", milestoneId).eq("project_id", project.id);
    return NextResponse.json({ error: rollbackError ? `Không ghi được audit log và không rollback được milestone: ${auditError.message}; ${rollbackError.message}` : `Không ghi được audit log; thay đổi trạng thái đã được hoàn tác. ${auditError.message}` }, { status: 400 });
  }

  const message = action === "START" ? "Đã bắt đầu milestone PDSA." : action === "COMPLETE" ? "Đã hoàn thành milestone PDSA và lưu kết quả học tập/quyết định khi áp dụng." : action === "RESET" ? "Đã hoàn milestone về trạng thái Dự kiến để chỉnh sửa/thực hiện lại." : "Đã mở lại milestone để thực hiện lại.";
  return NextResponse.json({ ok: true, status: targetStatus, message });
}
