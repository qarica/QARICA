import { NextResponse } from "next/server";
import {
  canDeletePdsaMilestone,
  canEditPdsaMilestone,
  canEditSmartObjective,
  existingImprovementColumn,
  isDateWithinProject,
  isValidPdsaPhase,
  MILESTONE_COLUMNS,
  normalizeProjectMilestone,
  normalizeProjectObjective,
  normalizedImprovementText,
  OBJECTIVE_COLUMNS,
} from "@/lib/improvement-project-setup";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const text = (value: unknown) => String(value ?? "").trim();

type AnyRow = Record<string, any>;

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

function rollbackPatch(row: AnyRow, patch: Record<string, unknown>) {
  const rollback: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) rollback[key] = row[key] ?? null;
  return rollback;
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

  const admin = ctx.admin;
  const actorUserId = ctx.user.id;
  const project = ctx.project;
  const projectId = project.id;
  const status = String(project.workflow_status || "DRAFT").toUpperCase();
  const body = await request.json().catch(() => ({}));
  const action = text(body.action).toUpperCase();
  const reason = text(body.reason) || null;
  const now = new Date().toISOString();

  async function logChange(input: { table: string; rowId: string; actionType: string; oldValue?: unknown; newValue?: unknown; fallbackReason?: string }) {
    return admin.from("audit_logs").insert({
      actor_user_id: actorUserId,
      record_id: recordId,
      table_name: input.table,
      row_id: input.rowId,
      action_type: input.actionType,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
      reason: reason || input.fallbackReason || null,
      request_meta: { source: "qlcl-ui", project_workflow_status: status },
    });
  }

  if (["ADD_OBJECTIVE", "UPDATE_OBJECTIVE", "DELETE_OBJECTIVE"].includes(action)) {
    if (!canEditSmartObjective(status)) return NextResponse.json({ error: "Mục tiêu SMART đã được khóa sau khi đề án rời trạng thái Nháp." }, { status: 409 });

    if (action === "DELETE_OBJECTIVE") {
      const objectiveId = text(body.objective_id);
      if (!objectiveId || !reason) return NextResponse.json({ error: "Cần chọn mục tiêu và nhập lý do xóa." }, { status: 400 });
      const { data: row } = await admin.from("project_objectives").select("*").eq("id", objectiveId).eq("project_id", projectId).maybeSingle();
      if (!row) return NextResponse.json({ error: "Không tìm thấy mục tiêu SMART trong đề án này." }, { status: 404 });
      const oldValue = normalizeProjectObjective(row);
      const { error: deleteError } = await admin.from("project_objectives").delete().eq("id", objectiveId).eq("project_id", projectId);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
      const { error: auditError } = await logChange({ table: "project_objectives", rowId: objectiveId, actionType: "IMPROVEMENT_OBJECTIVE_DELETE", oldValue });
      if (auditError) {
        const { error: restoreError } = await admin.from("project_objectives").insert(row);
        return NextResponse.json({ error: restoreError ? `Không ghi được audit log và không khôi phục được mục tiêu: ${auditError.message}; ${restoreError.message}` : `Không ghi được audit log; mục tiêu đã được khôi phục. ${auditError.message}` }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: "Đã xóa mục tiêu SMART nháp và ghi audit trail." });
    }

    const statement = text(body.statement);
    const indicator = text(body.indicator);
    const baseline = text(body.baseline);
    const target = text(body.target);
    const unit = text(body.unit);
    const dueDate = text(body.due_date) || null;
    if (!statement || !indicator || !baseline || !target || !dueDate) return NextResponse.json({ error: "Mục tiêu SMART cần đủ nội dung, chỉ số đo, baseline, target và hạn đạt." }, { status: 400 });
    if (!isDateWithinProject(dueDate, project.start_date, project.target_end_date)) return NextResponse.json({ error: "Hạn mục tiêu phải nằm trong thời gian thực hiện đề án." }, { status: 400 });
    const current = await snapshot(admin, projectId);

    if (action === "ADD_OBJECTIVE") {
      if (current.objectives.some((item) => normalizedImprovementText(item.statement) === normalizedImprovementText(statement))) return NextResponse.json({ error: "Mục tiêu SMART này đã tồn tại." }, { status: 409 });
      const order = current.objectives.length ? Math.max(...current.objectives.map((item) => Number(item.order) || 0)) + 1 : 1;
      const base = { project_id: projectId };
      const result = await insertCompatible(admin, "project_objectives", [
        { ...base, sequence_no: order, objective_text: statement, indicator_name: indicator, baseline_value: baseline, target_value: target, unit: unit || null, target_date: dueDate },
        { ...base, objective_no: order, objective_statement: statement, indicator_name: indicator, baseline_value: baseline, target_value: target, unit: unit || null, due_date: dueDate },
        { ...base, sort_order: order, objective: statement, measure_name: indicator, baseline, target, target_unit: unit || null, deadline: dueDate },
        { ...base, sort_order: order, description: statement, measurement_method: indicator, baseline_value: baseline, target_value: target, unit: unit || null, due_date: dueDate },
      ]);
      if (!result.data) return NextResponse.json({ error: result.error }, { status: 400 });
      const newValue = { statement, indicator, baseline, target, unit: unit || null, due_date: dueDate, order };
      const { error: auditError } = await logChange({ table: "project_objectives", rowId: result.data.id, actionType: "IMPROVEMENT_OBJECTIVE_ADD", newValue });
      if (auditError) {
        await admin.from("project_objectives").delete().eq("id", result.data.id);
        return NextResponse.json({ error: `Không ghi được audit log; mục tiêu mới đã được hoàn tác. ${auditError.message}` }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: "Đã thêm mục tiêu SMART." });
    }

    const objectiveId = text(body.objective_id);
    if (!objectiveId) return NextResponse.json({ error: "Thiếu mục tiêu SMART cần sửa." }, { status: 400 });
    const { data: row } = await admin.from("project_objectives").select("*").eq("id", objectiveId).eq("project_id", projectId).maybeSingle();
    if (!row) return NextResponse.json({ error: "Không tìm thấy mục tiêu SMART trong đề án này." }, { status: 404 });
    if (current.objectives.some((item) => item.id !== objectiveId && normalizedImprovementText(item.statement) === normalizedImprovementText(statement))) return NextResponse.json({ error: "Mục tiêu SMART này đã tồn tại." }, { status: 409 });

    const statementCol = existingImprovementColumn(row, OBJECTIVE_COLUMNS.statement);
    const indicatorCol = existingImprovementColumn(row, OBJECTIVE_COLUMNS.indicator);
    const baselineCol = existingImprovementColumn(row, OBJECTIVE_COLUMNS.baseline);
    const targetCol = existingImprovementColumn(row, OBJECTIVE_COLUMNS.target);
    const dueDateCol = existingImprovementColumn(row, OBJECTIVE_COLUMNS.dueDate);
    const unitCol = existingImprovementColumn(row, OBJECTIVE_COLUMNS.unit);
    if (!statementCol || !indicatorCol || !baselineCol || !targetCol || !dueDateCol) return NextResponse.json({ error: "Schema mục tiêu SMART hiện tại không đủ cột để chỉnh sửa an toàn." }, { status: 409 });
    const patch: Record<string, unknown> = { [statementCol]: statement, [indicatorCol]: indicator, [baselineCol]: baseline, [targetCol]: target, [dueDateCol]: dueDate };
    if (unitCol) patch[unitCol] = unit || null;
    if (Object.prototype.hasOwnProperty.call(row, "updated_at")) patch.updated_at = now;
    const oldValue = normalizeProjectObjective(row);
    const { error: updateError } = await admin.from("project_objectives").update(patch).eq("id", objectiveId).eq("project_id", projectId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    const newValue = { ...oldValue, statement, indicator, baseline, target, unit: unit || null, due_date: dueDate };
    const { error: auditError } = await logChange({ table: "project_objectives", rowId: objectiveId, actionType: "IMPROVEMENT_OBJECTIVE_UPDATE", oldValue, newValue, fallbackReason: "Chỉnh sửa mục tiêu SMART khi đề án còn Nháp." });
    if (auditError) {
      await admin.from("project_objectives").update(rollbackPatch(row, patch)).eq("id", objectiveId);
      return NextResponse.json({ error: `Không ghi được audit log; thay đổi đã được hoàn tác. ${auditError.message}` }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Đã cập nhật mục tiêu SMART và ghi audit trail." });
  }

  if (["ADD_MILESTONE", "UPDATE_MILESTONE", "DELETE_MILESTONE"].includes(action)) {
    if (action === "DELETE_MILESTONE") {
      const milestoneId = text(body.milestone_id);
      if (!milestoneId || !reason) return NextResponse.json({ error: "Cần chọn milestone và nhập lý do xóa." }, { status: 400 });
      const { data: row } = await admin.from("project_milestones").select("*").eq("id", milestoneId).eq("project_id", projectId).maybeSingle();
      if (!row) return NextResponse.json({ error: "Không tìm thấy milestone trong đề án này." }, { status: 404 });
      const oldValue = normalizeProjectMilestone(row);
      if (!canDeletePdsaMilestone(status, oldValue.status)) return NextResponse.json({ error: "Chỉ được xóa milestone còn PLANNED khi đề án đang Nháp." }, { status: 409 });
      const { error: deleteError } = await admin.from("project_milestones").delete().eq("id", milestoneId).eq("project_id", projectId);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
      const { error: auditError } = await logChange({ table: "project_milestones", rowId: milestoneId, actionType: "IMPROVEMENT_MILESTONE_DELETE", oldValue });
      if (auditError) {
        const { error: restoreError } = await admin.from("project_milestones").insert(row);
        return NextResponse.json({ error: restoreError ? `Không ghi được audit log và không khôi phục được milestone: ${auditError.message}; ${restoreError.message}` : `Không ghi được audit log; milestone đã được khôi phục. ${auditError.message}` }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: "Đã xóa milestone PDSA nháp và ghi audit trail." });
    }

    const title = text(body.title);
    const phase = text(body.phase).toUpperCase();
    const description = text(body.description);
    const startDate = text(body.start_date) || null;
    const endDate = text(body.end_date) || null;
    if (!title || !isValidPdsaPhase(phase)) return NextResponse.json({ error: "Cần nhập milestone và chọn đúng pha PDSA: PLAN, DO, STUDY hoặc ACT." }, { status: 400 });
    if (startDate && endDate && startDate > endDate) return NextResponse.json({ error: "Ngày bắt đầu milestone không được sau ngày kết thúc." }, { status: 400 });
    if (!isDateWithinProject(startDate, project.start_date, project.target_end_date) || !isDateWithinProject(endDate, project.start_date, project.target_end_date)) return NextResponse.json({ error: "Thời gian milestone phải nằm trong thời gian thực hiện đề án." }, { status: 400 });
    const current = await snapshot(admin, projectId);

    if (action === "ADD_MILESTONE") {
      if (!["DRAFT", "APPROVED", "IN_PROGRESS"].includes(status)) return NextResponse.json({ error: "Milestone/PDSA chỉ được bổ sung khi đề án còn Nháp, đã phê duyệt hoặc đang triển khai." }, { status: 409 });
      if (current.milestones.some((item) => item.phase === phase && normalizedImprovementText(item.title) === normalizedImprovementText(title))) return NextResponse.json({ error: "Milestone này đã tồn tại trong cùng pha PDSA." }, { status: 409 });
      const order = current.milestones.length ? Math.max(...current.milestones.map((item) => Number(item.order) || 0)) + 1 : 1;
      const base = { project_id: projectId };
      const result = await insertCompatible(admin, "project_milestones", [
        { ...base, sequence_no: order, title, pdsa_phase: phase, description: description || null, planned_start_date: startDate, planned_end_date: endDate, status: "PLANNED" },
        { ...base, milestone_no: order, milestone_name: title, phase, notes: description || null, start_date: startDate, due_date: endDate, workflow_status: "PLANNED" },
        { ...base, sort_order: order, name: title, milestone_type: phase, description: description || null, start_date: startDate, target_date: endDate, milestone_status: "PLANNED" },
        { ...base, sort_order: order, description: title, phase, detail: description || null, planned_date: endDate, status: "PLANNED" },
      ]);
      if (!result.data) return NextResponse.json({ error: result.error }, { status: 400 });
      const newValue = { title, phase, description: description || null, start_date: startDate, end_date: endDate, status: "PLANNED", order };
      const { error: auditError } = await logChange({ table: "project_milestones", rowId: result.data.id, actionType: "IMPROVEMENT_MILESTONE_ADD", newValue });
      if (auditError) {
        await admin.from("project_milestones").delete().eq("id", result.data.id);
        return NextResponse.json({ error: `Không ghi được audit log; milestone mới đã được hoàn tác. ${auditError.message}` }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: `Đã thêm milestone ${phase}.` });
    }

    const milestoneId = text(body.milestone_id);
    if (!milestoneId) return NextResponse.json({ error: "Thiếu milestone cần sửa." }, { status: 400 });
    const { data: row } = await admin.from("project_milestones").select("*").eq("id", milestoneId).eq("project_id", projectId).maybeSingle();
    if (!row) return NextResponse.json({ error: "Không tìm thấy milestone trong đề án này." }, { status: 404 });
    const oldValue = normalizeProjectMilestone(row);
    if (!canEditPdsaMilestone(status, oldValue.status)) return NextResponse.json({ error: "Chỉ được sửa milestone còn PLANNED khi đề án đang Nháp, đã phê duyệt hoặc đang triển khai." }, { status: 409 });
    if (current.milestones.some((item) => item.id !== milestoneId && item.phase === phase && normalizedImprovementText(item.title) === normalizedImprovementText(title))) return NextResponse.json({ error: "Milestone này đã tồn tại trong cùng pha PDSA." }, { status: 409 });

    const titleCol = existingImprovementColumn(row, MILESTONE_COLUMNS.title);
    const phaseCol = existingImprovementColumn(row, MILESTONE_COLUMNS.phase);
    const descriptionCol = existingImprovementColumn(row, MILESTONE_COLUMNS.description, titleCol ? [titleCol] : []);
    const startCol = existingImprovementColumn(row, MILESTONE_COLUMNS.startDate);
    const endCol = existingImprovementColumn(row, MILESTONE_COLUMNS.endDate);
    if (!titleCol || !phaseCol) return NextResponse.json({ error: "Schema milestone hiện tại không đủ cột để chỉnh sửa an toàn." }, { status: 409 });
    const patch: Record<string, unknown> = { [titleCol]: title, [phaseCol]: phase };
    if (descriptionCol) patch[descriptionCol] = description || null;
    if (startCol) patch[startCol] = startDate;
    if (endCol) patch[endCol] = endDate;
    if (Object.prototype.hasOwnProperty.call(row, "updated_at")) patch.updated_at = now;
    const { error: updateError } = await admin.from("project_milestones").update(patch).eq("id", milestoneId).eq("project_id", projectId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    const newValue = { ...oldValue, title, phase, description: description || null, start_date: startDate, end_date: endDate };
    const { error: auditError } = await logChange({ table: "project_milestones", rowId: milestoneId, actionType: "IMPROVEMENT_MILESTONE_UPDATE", oldValue, newValue, fallbackReason: "Chỉnh sửa milestone PDSA còn PLANNED." });
    if (auditError) {
      await admin.from("project_milestones").update(rollbackPatch(row, patch)).eq("id", milestoneId);
      return NextResponse.json({ error: `Không ghi được audit log; thay đổi đã được hoàn tác. ${auditError.message}` }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Đã cập nhật milestone PDSA và ghi audit trail." });
  }

  return NextResponse.json({ error: "Thao tác SMART/PDSA không hợp lệ." }, { status: 400 });
}
