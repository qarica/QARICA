import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isDateWithinProject, isValidPdsaPhase, normalizeProjectMilestone, normalizeProjectObjective, normalizedImprovementText } from "@/lib/improvement-project-setup";

const text = (value: unknown) => String(value ?? "").trim();

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
    return { ok: false as const, response: NextResponse.json({ error: "Đề án không thuộc phạm vi bệnh viện hiện tại hoặc đã đóng." }, { status: 403 }) };
  }
  return { ok: true as const, admin, user: auth.user, record, project };
}

async function insertCompatible(admin: ReturnType<typeof createAdminClient>, table: string, candidates: Record<string, unknown>[]) {
  let lastError = `Không ghi được dữ liệu ${table}.`;
  for (const payload of candidates) {
    const { data, error } = await admin.from(table).insert(payload).select("*").single();
    if (!error && data) return { data, error: null as string | null };
    lastError = error?.message || lastError;
    const schemaMismatch = error?.code === "PGRST204" || error?.code === "42703" || /column .* does not exist|Could not find the .* column/i.test(error?.message || "");
    if (!schemaMismatch) break;
  }
  return { data: null, error: lastError };
}

async function snapshot(admin: ReturnType<typeof createAdminClient>, projectId: string) {
  const [{ data: rawObjectives, error: objectiveError }, { data: rawMilestones, error: milestoneError }] = await Promise.all([
    admin.from("project_objectives").select("*").eq("project_id", projectId),
    admin.from("project_milestones").select("*").eq("project_id", projectId),
  ]);
  if (objectiveError) throw objectiveError;
  if (milestoneError) throw milestoneError;
  const objectives = (rawObjectives ?? []).map((row, index) => normalizeProjectObjective(row, index)).sort((a, b) => a.order - b.order || a.statement.localeCompare(b.statement, "vi"));
  const milestones = (rawMilestones ?? []).map((row, index) => normalizeProjectMilestone(row, index)).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "vi"));
  return { objectives, milestones };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const ctx = await context(recordId);
  if (!ctx.ok) return ctx.response;
  try {
    const data = await snapshot(ctx.admin, ctx.project.id);
    return NextResponse.json({ ...data, workflow_status: ctx.project.workflow_status, start_date: ctx.project.start_date, target_end_date: ctx.project.target_end_date });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không đọc được dữ liệu SMART/PDSA." }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const ctx = await context(recordId);
  if (!ctx.ok) return ctx.response;
  const body = await request.json().catch(() => ({}));
  const action = text(body.action).toUpperCase();
  const status = String(ctx.project.workflow_status || "DRAFT");

  if (action === "ADD_OBJECTIVE") {
    if (status !== "DRAFT") return NextResponse.json({ error: "Mục tiêu SMART chỉ được bổ sung khi đề án còn Nháp; sau khi gửi phê duyệt phải giữ nguyên đích cải tiến." }, { status: 409 });
    const statement = text(body.statement);
    const indicator = text(body.indicator);
    const baseline = text(body.baseline);
    const target = text(body.target);
    const unit = text(body.unit);
    const dueDate = text(body.due_date) || null;
    if (!statement || !indicator || !baseline || !target || !dueDate) return NextResponse.json({ error: "Mục tiêu SMART cần đủ nội dung, chỉ số đo, baseline, target và hạn đạt." }, { status: 400 });
    if (!isDateWithinProject(dueDate, ctx.project.start_date, ctx.project.target_end_date)) return NextResponse.json({ error: "Hạn mục tiêu phải nằm trong thời gian thực hiện đề án." }, { status: 400 });
    const current = await snapshot(ctx.admin, ctx.project.id);
    if (current.objectives.some((item) => normalizedImprovementText(item.statement) === normalizedImprovementText(statement))) return NextResponse.json({ error: "Mục tiêu SMART này đã tồn tại." }, { status: 409 });
    const order = current.objectives.length ? Math.max(...current.objectives.map((item) => Number(item.order) || 0)) + 1 : 1;
    const base = { project_id: ctx.project.id };
    const result = await insertCompatible(ctx.admin, "project_objectives", [
      { ...base, sequence_no: order, objective_text: statement, indicator_name: indicator, baseline_value: baseline, target_value: target, unit: unit || null, target_date: dueDate },
      { ...base, objective_no: order, objective_statement: statement, indicator_name: indicator, baseline_value: baseline, target_value: target, unit: unit || null, due_date: dueDate },
      { ...base, sort_order: order, objective: statement, measure_name: indicator, baseline, target, target_unit: unit || null, deadline: dueDate },
      { ...base, sort_order: order, description: statement, measurement_method: indicator, baseline_value: baseline, target_value: target, unit: unit || null, due_date: dueDate },
    ]);
    if (!result.data) return NextResponse.json({ error: result.error }, { status: 400 });
    await ctx.admin.from("audit_logs").insert({ actor_user_id: ctx.user.id, record_id: recordId, table_name: "project_objectives", row_id: result.data.id, action_type: "IMPROVEMENT_OBJECTIVE_ADD", new_value: { statement, indicator, baseline, target, unit: unit || null, due_date: dueDate, order }, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, message: "Đã thêm mục tiêu SMART." });
  }

  if (action === "ADD_MILESTONE") {
    if (!["DRAFT", "APPROVED", "IN_PROGRESS"].includes(status)) return NextResponse.json({ error: "Milestone/PDSA chỉ được bổ sung khi đề án còn Nháp, đã phê duyệt hoặc đang triển khai." }, { status: 409 });
    const title = text(body.title);
    const phase = text(body.phase).toUpperCase();
    const description = text(body.description);
    const startDate = text(body.start_date) || null;
    const endDate = text(body.end_date) || null;
    if (!title || !isValidPdsaPhase(phase)) return NextResponse.json({ error: "Cần nhập milestone và chọn đúng pha PDSA: PLAN, DO, STUDY hoặc ACT." }, { status: 400 });
    if (startDate && endDate && startDate > endDate) return NextResponse.json({ error: "Ngày bắt đầu milestone không được sau ngày kết thúc." }, { status: 400 });
    if (!isDateWithinProject(startDate, ctx.project.start_date, ctx.project.target_end_date) || !isDateWithinProject(endDate, ctx.project.start_date, ctx.project.target_end_date)) return NextResponse.json({ error: "Thời gian milestone phải nằm trong thời gian thực hiện đề án." }, { status: 400 });
    const current = await snapshot(ctx.admin, ctx.project.id);
    if (current.milestones.some((item) => item.phase === phase && normalizedImprovementText(item.title) === normalizedImprovementText(title))) return NextResponse.json({ error: "Milestone này đã tồn tại trong cùng pha PDSA." }, { status: 409 });
    const order = current.milestones.length ? Math.max(...current.milestones.map((item) => Number(item.order) || 0)) + 1 : 1;
    const base = { project_id: ctx.project.id };
    const result = await insertCompatible(ctx.admin, "project_milestones", [
      { ...base, sequence_no: order, title, pdsa_phase: phase, description: description || null, planned_start_date: startDate, planned_end_date: endDate, status: "PLANNED" },
      { ...base, milestone_no: order, milestone_name: title, phase, notes: description || null, start_date: startDate, due_date: endDate, workflow_status: "PLANNED" },
      { ...base, sort_order: order, name: title, milestone_type: phase, description: description || null, start_date: startDate, target_date: endDate, milestone_status: "PLANNED" },
      { ...base, sort_order: order, description: title, phase, detail: description || null, planned_date: endDate, status: "PLANNED" },
    ]);
    if (!result.data) return NextResponse.json({ error: result.error }, { status: 400 });
    await ctx.admin.from("audit_logs").insert({ actor_user_id: ctx.user.id, record_id: recordId, table_name: "project_milestones", row_id: result.data.id, action_type: "IMPROVEMENT_MILESTONE_ADD", new_value: { title, phase, description: description || null, start_date: startDate, end_date: endDate, order }, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, message: `Đã thêm milestone ${phase}.` });
  }

  return NextResponse.json({ error: "Thao tác SMART/PDSA không hợp lệ." }, { status: 400 });
}
