import { NextResponse } from "next/server";
import { normalizeProjectMilestone, normalizeProjectObjective } from "@/lib/improvement-project-setup";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SETUP_RPC = "qlcl_manage_improvement_setup_v1";
const ACTIONS = new Set([
  "ADD_OBJECTIVE",
  "UPDATE_OBJECTIVE",
  "DELETE_OBJECTIVE",
  "ADD_MILESTONE",
  "UPDATE_MILESTONE",
  "DELETE_MILESTONE",
]);

async function context(recordId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false as const, response: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };

  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "projects.manage" });
  if (!allowed) return { ok: false as const, response: NextResponse.json({ error: "Bạn chưa có quyền quản lý đề án cải tiến." }, { status: 403 }) };

  const admin = createAdminClient();
  const [{ data: caller }, { data: record }, { data: project }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("records").select("id,organization_id,lifecycle_status").eq("id", recordId).eq("record_type", "IMPROVEMENT_PROJECT").maybeSingle(),
    admin.from("improvement_projects").select("id,workflow_status,start_date,target_end_date").eq("record_id", recordId).maybeSingle(),
  ]);

  if (!caller?.is_active || !caller.organization_id || !record || record.organization_id !== caller.organization_id || record.lifecycle_status !== "ACTIVE" || !project) {
    return { ok: false as const, response: NextResponse.json({ error: "Đề án không thuộc phạm vi tổ chức hiện tại hoặc đã đóng." }, { status: 403 }) };
  }
  return { ok: true as const, admin, user: auth.user, project };
}

async function snapshot(admin: ReturnType<typeof createAdminClient>, projectId: string) {
  const [{ data: rawObjectives, error: objectiveError }, { data: rawMilestones, error: milestoneError }] = await Promise.all([
    admin
      .from("project_objectives")
      .select("id,project_id,objective_text,sequence_no,indicator_name,baseline_value,target_value,unit,target_date,updated_at")
      .eq("project_id", projectId)
      .order("sequence_no"),
    admin
      .from("project_milestones")
      .select("id,project_id,title,due_date,status,sequence_no,pdsa_phase,description,planned_start_date,planned_end_date,study_result,learning_summary,act_decision,updated_at")
      .eq("project_id", projectId)
      .order("sequence_no"),
  ]);
  if (objectiveError) throw objectiveError;
  if (milestoneError) throw milestoneError;
  const objectives = (rawObjectives ?? []).map((row, index) => normalizeProjectObjective(row, index));
  const milestones = (rawMilestones ?? []).map((row, index) => normalizeProjectMilestone(row, index));
  return { objectives, milestones };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const ctx = await context(recordId);
  if (!ctx.ok) return ctx.response;
  try {
    const data = await snapshot(ctx.admin, ctx.project.id);
    return NextResponse.json({
      ...data,
      workflow_status: ctx.project.workflow_status,
      start_date: ctx.project.start_date,
      target_end_date: ctx.project.target_end_date,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không đọc được dữ liệu SMART/PDSA." }, { status: 400 });
  }
}

function actionMessage(action: string) {
  if (action === "ADD_OBJECTIVE") return "Đã thêm mục tiêu SMART.";
  if (action === "UPDATE_OBJECTIVE") return "Đã cập nhật mục tiêu SMART và ghi audit trail.";
  if (action === "DELETE_OBJECTIVE") return "Đã xóa mục tiêu SMART nháp và ghi audit trail.";
  if (action === "ADD_MILESTONE") return "Đã thêm milestone PDSA.";
  if (action === "UPDATE_MILESTONE") return "Đã cập nhật milestone PDSA và ghi audit trail.";
  if (action === "DELETE_MILESTONE") return "Đã xóa milestone PDSA nháp và ghi audit trail.";
  return "Đã cập nhật SMART/PDSA.";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const ctx = await context(recordId);
  if (!ctx.ok) return ctx.response;

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").trim().toUpperCase();
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Thao tác SMART/PDSA không hợp lệ." }, { status: 400 });

  const { data: tx, error } = await ctx.admin.rpc(SETUP_RPC, {
    p_record_id: recordId,
    p_actor_user_id: ctx.user.id,
    p_action: action,
    p_payload: body,
    p_reason: String(body.reason || "").trim() || null,
  });

  if (error) {
    const message = rpcErrorMessage(error, "Không cập nhật được SMART/PDSA.");
    const status = /không thuộc phạm vi|không có quyền|tài khoản.*ngưng/i.test(message)
      ? 403
      : /đã tồn tại|đã khóa|chỉ được|phải nằm|không được sau|không tìm thấy|bắt buộc|không hợp lệ|cần chọn|thiếu/i.test(message)
        ? 409
        : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true, message: actionMessage(action), transaction: "atomic", result: tx });
}
