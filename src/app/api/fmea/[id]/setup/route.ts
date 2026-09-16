import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  calculateFmeaRpn,
  canDeleteFmeaAnalysis,
  canEditFmeaAnalysis,
  existingFmeaColumn,
  FMEA_MODE_COLUMNS,
  FMEA_STEP_COLUMNS,
  normalizeFmeaFailureMode,
  normalizeFmeaStep,
  normalizedFmeaText,
  validFmeaScore,
  type FmeaRow,
} from "@/lib/fmea-setup";

const text = (value: unknown) => String(value ?? "").trim();

async function context(recordId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false as const, response: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "risk.manage" });
  if (!allowed) return { ok: false as const, response: NextResponse.json({ error: "Bạn chưa có quyền quản lý FMEA/HFMEA." }, { status: 403 }) };
  const admin = createAdminClient();
  const [{ data: caller }, { data: record }, { data: study }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("records").select("id,organization_id,lifecycle_status").eq("id", recordId).eq("record_type", "FMEA").maybeSingle(),
    admin.from("fmea_studies").select("id,workflow_status,method").eq("record_id", recordId).maybeSingle(),
  ]);
  if (!caller?.is_active || !caller.organization_id || !record || record.organization_id !== caller.organization_id || record.lifecycle_status !== "ACTIVE" || !study) {
    return { ok: false as const, response: NextResponse.json({ error: "Hồ sơ FMEA không thuộc phạm vi bệnh viện hiện tại hoặc đã đóng." }, { status: 403 }) };
  }
  return { ok: true as const, admin, user: auth.user, study, record };
}

async function insertCompatible(admin: ReturnType<typeof createAdminClient>, table: string, candidates: Record<string, unknown>[]) {
  let lastError = "Không ghi được dữ liệu FMEA.";
  for (const payload of candidates) {
    const { data, error } = await admin.from(table).insert(payload).select("*").single();
    if (!error && data) return { data, error: null as string | null };
    lastError = error?.message || lastError;
    const schemaMismatch = error?.code === "PGRST204" || error?.code === "42703" || /column .* does not exist|Could not find the .* column/i.test(error?.message || "");
    if (!schemaMismatch) break;
  }
  return { data: null, error: lastError };
}

async function snapshot(admin: ReturnType<typeof createAdminClient>, studyId: string) {
  const { data: rawSteps, error: stepError } = await admin.from("fmea_process_steps").select("*").eq("fmea_study_id", studyId);
  if (stepError) throw stepError;
  const steps = (rawSteps ?? []).map((row, index) => normalizeFmeaStep(row, index)).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "vi"));
  const stepIds = steps.map((step) => step.id).filter(Boolean);
  const { data: rawModes, error: modeError } = stepIds.length ? await admin.from("fmea_failure_modes").select("*").in("process_step_id", stepIds) : { data: [], error: null };
  if (modeError) throw modeError;
  const modes = (rawModes ?? []).map((row, index) => normalizeFmeaFailureMode(row, index)).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "vi"));
  return { steps, modes, rawSteps: (rawSteps ?? []) as FmeaRow[], rawModes: (rawModes ?? []) as FmeaRow[] };
}

function stepPatch(row: FmeaRow, label: string, description: string) {
  const labelKey = existingFmeaColumn(row, ["step_name", "name", "process_step", "step_description", "description"]);
  if (!labelKey) return null;
  const descriptionKey = existingFmeaColumn(row, FMEA_STEP_COLUMNS.description, [labelKey]);
  const patch: Record<string, unknown> = { [labelKey]: label };
  if (descriptionKey) patch[descriptionKey] = description || null;
  return patch;
}

function modePatch(row: FmeaRow, input: { processStepId: string; label: string; effect: string; cause: string; control: string; severity: number; occurrence: number; detection: number; rpn: number; highPriority: boolean }) {
  const patch: Record<string, unknown> = { process_step_id: input.processStepId };
  const assign = (keys: readonly string[], value: unknown) => { const key = existingFmeaColumn(row, keys); if (key) patch[key] = value; };
  assign(FMEA_MODE_COLUMNS.label, input.label);
  assign(FMEA_MODE_COLUMNS.effect, input.effect || null);
  assign(FMEA_MODE_COLUMNS.cause, input.cause || null);
  assign(FMEA_MODE_COLUMNS.control, input.control || null);
  assign(FMEA_MODE_COLUMNS.severity, input.severity);
  assign(FMEA_MODE_COLUMNS.occurrence, input.occurrence);
  assign(FMEA_MODE_COLUMNS.detection, input.detection);
  assign(FMEA_MODE_COLUMNS.rpn, input.rpn);
  if (Object.prototype.hasOwnProperty.call(row, "is_high_priority")) patch.is_high_priority = input.highPriority;
  return patch;
}

function rollbackPatch(row: FmeaRow, patch: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(patch).map((key) => [key, row[key] ?? null]));
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const ctx = await context(recordId);
  if (!ctx.ok) return ctx.response;
  try {
    const data = await snapshot(ctx.admin, ctx.study.id);
    return NextResponse.json({ steps: data.steps, modes: data.modes, workflow_status: ctx.study.workflow_status, method: ctx.study.method });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không đọc được dữ liệu FMEA." }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const ctx = await context(recordId);
  if (!ctx.ok) return ctx.response;
  const body = await request.json().catch(() => ({}));
  const action = text(body.action).toUpperCase();
  const reason = text(body.reason) || null;
  if (!canEditFmeaAnalysis(ctx.study.workflow_status)) return NextResponse.json({ error: "FMEA đã qua giai đoạn được phép chỉnh sửa phân tích nền." }, { status: 409 });

  async function logChange(input: { table: string; rowId: string; actionType: string; oldValue?: unknown; newValue?: unknown; fallbackReason?: string }) {
    return ctx.admin.from("audit_logs").insert({ actor_user_id: ctx.user.id, record_id: recordId, table_name: input.table, row_id: input.rowId, action_type: input.actionType, old_value: input.oldValue ?? null, new_value: input.newValue ?? null, reason: reason || input.fallbackReason || null, request_meta: { source: "qlcl-ui", fmea_workflow_status: ctx.study.workflow_status } });
  }

  if (["ADD_STEP", "UPDATE_STEP", "DELETE_STEP"].includes(action)) {
    const stepId = text(body.step_id);
    const current = await snapshot(ctx.admin, ctx.study.id);

    if (action === "DELETE_STEP") {
      if (!canDeleteFmeaAnalysis(ctx.study.workflow_status)) return NextResponse.json({ error: "Chỉ được xóa bước quy trình khi FMEA còn DRAFT." }, { status: 409 });
      if (!stepId) return NextResponse.json({ error: "Thiếu bước quy trình cần xóa." }, { status: 400 });
      if (!reason || reason.length < 3) return NextResponse.json({ error: "Cần nhập lý do xóa để truy vết." }, { status: 400 });
      if (current.modes.some((mode) => mode.process_step_id === stepId)) return NextResponse.json({ error: "Bước này đang có failure mode. Hãy xóa các failure mode thuộc bước trước." }, { status: 409 });
      const raw = current.rawSteps.find((row) => String(row.id) === stepId);
      if (!raw) return NextResponse.json({ error: "Không tìm thấy bước quy trình." }, { status: 404 });
      const oldValue = normalizeFmeaStep(raw);
      const { error: deleteError } = await ctx.admin.from("fmea_process_steps").delete().eq("id", stepId).eq("fmea_study_id", ctx.study.id);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
      const { error: logError } = await logChange({ table: "fmea_process_steps", rowId: stepId, actionType: "FMEA_PROCESS_STEP_DELETE", oldValue });
      if (logError) {
        const restore = await ctx.admin.from("fmea_process_steps").insert(raw);
        return NextResponse.json({ error: restore.error ? `Không ghi được audit trail và không tự khôi phục được bước: ${restore.error.message}` : `Không ghi được audit trail; thao tác xóa đã được hoàn tác. ${logError.message}` }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: "Đã xóa bước quy trình nhập nhầm và lưu audit trail." });
    }

    const label = text(body.label), description = text(body.description);
    if (!label) return NextResponse.json({ error: "Tên bước quy trình là bắt buộc." }, { status: 400 });
    if (current.steps.some((step) => step.id !== stepId && normalizedFmeaText(step.label) === normalizedFmeaText(label))) return NextResponse.json({ error: "Bước quy trình này đã tồn tại." }, { status: 409 });

    if (action === "ADD_STEP") {
      const order = current.steps.length ? Math.max(...current.steps.map((step) => Number(step.order) || 0)) + 1 : 1;
      const base = { fmea_study_id: ctx.study.id };
      const result = await insertCompatible(ctx.admin, "fmea_process_steps", [
        { ...base, sequence_no: order, step_name: label, step_description: description || null },
        { ...base, step_no: order, step_name: label, description: description || null },
        { ...base, step_order: order, name: label, description: description || null },
        { ...base, sort_order: order, process_step: label, description: description || null },
      ]);
      if (!result.data) return NextResponse.json({ error: result.error }, { status: 400 });
      const { error: logError } = await logChange({ table: "fmea_process_steps", rowId: result.data.id, actionType: "FMEA_PROCESS_STEP_ADD", newValue: { label, description: description || null, order } });
      if (logError) { await ctx.admin.from("fmea_process_steps").delete().eq("id", result.data.id); return NextResponse.json({ error: `Không ghi được audit trail; bước mới đã được hoàn tác. ${logError.message}` }, { status: 400 }); }
      return NextResponse.json({ ok: true, message: "Đã thêm bước quy trình." });
    }

    if (!stepId) return NextResponse.json({ error: "Thiếu bước quy trình cần sửa." }, { status: 400 });
    const raw = current.rawSteps.find((row) => String(row.id) === stepId);
    if (!raw) return NextResponse.json({ error: "Không tìm thấy bước quy trình." }, { status: 404 });
    const patch = stepPatch(raw, label, description);
    if (!patch) return NextResponse.json({ error: "Schema bước quy trình hiện tại chưa hỗ trợ chỉnh sửa tương thích." }, { status: 409 });
    const oldValue = normalizeFmeaStep(raw);
    const { error: updateError } = await ctx.admin.from("fmea_process_steps").update(patch).eq("id", stepId).eq("fmea_study_id", ctx.study.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    const newValue = { ...oldValue, label, description: description || null };
    const { error: logError } = await logChange({ table: "fmea_process_steps", rowId: stepId, actionType: "FMEA_PROCESS_STEP_UPDATE", oldValue, newValue, fallbackReason: "Điều chỉnh bước quy trình trong giai đoạn phân tích." });
    if (logError) { await ctx.admin.from("fmea_process_steps").update(rollbackPatch(raw, patch)).eq("id", stepId); return NextResponse.json({ error: `Không ghi được audit trail; thay đổi đã được hoàn tác. ${logError.message}` }, { status: 400 }); }
    return NextResponse.json({ ok: true, message: "Đã cập nhật bước quy trình và lưu audit trail." });
  }

  if (["ADD_MODE", "UPDATE_MODE", "DELETE_MODE"].includes(action)) {
    const modeId = text(body.mode_id);
    const current = await snapshot(ctx.admin, ctx.study.id);

    if (action === "DELETE_MODE") {
      if (!canDeleteFmeaAnalysis(ctx.study.workflow_status)) return NextResponse.json({ error: "Chỉ được xóa failure mode khi FMEA còn DRAFT." }, { status: 409 });
      if (!modeId) return NextResponse.json({ error: "Thiếu failure mode cần xóa." }, { status: 400 });
      if (!reason || reason.length < 3) return NextResponse.json({ error: "Cần nhập lý do xóa để truy vết." }, { status: 400 });
      const raw = current.rawModes.find((row) => String(row.id) === modeId);
      if (!raw) return NextResponse.json({ error: "Không tìm thấy failure mode." }, { status: 404 });
      const oldValue = normalizeFmeaFailureMode(raw);
      const { error: deleteError } = await ctx.admin.from("fmea_failure_modes").delete().eq("id", modeId);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
      const { error: logError } = await logChange({ table: "fmea_failure_modes", rowId: modeId, actionType: "FMEA_FAILURE_MODE_DELETE", oldValue });
      if (logError) {
        const restore = await ctx.admin.from("fmea_failure_modes").insert(raw);
        return NextResponse.json({ error: restore.error ? `Không ghi được audit trail và không tự khôi phục được failure mode: ${restore.error.message}` : `Không ghi được audit trail; thao tác xóa đã được hoàn tác. ${logError.message}` }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: "Đã xóa failure mode nhập nhầm và lưu audit trail." });
    }

    const processStepId = text(body.process_step_id), label = text(body.label), effect = text(body.effect), cause = text(body.cause), control = text(body.control);
    const severity = validFmeaScore(body.severity), occurrence = validFmeaScore(body.occurrence), detection = validFmeaScore(body.detection);
    if (!processStepId || !label) return NextResponse.json({ error: "Cần chọn bước quy trình và nhập failure mode." }, { status: 400 });
    if (severity === null || occurrence === null || detection === null) return NextResponse.json({ error: "Điểm Severity, Occurrence và Detection phải là số nguyên từ 1 đến 10." }, { status: 400 });
    if (!current.steps.some((step) => step.id === processStepId)) return NextResponse.json({ error: "Bước quy trình không thuộc hồ sơ FMEA này." }, { status: 400 });
    if (current.modes.some((mode) => mode.id !== modeId && mode.process_step_id === processStepId && normalizedFmeaText(mode.label) === normalizedFmeaText(label))) return NextResponse.json({ error: "Failure mode này đã tồn tại trong bước đã chọn." }, { status: 409 });
    const rpn = calculateFmeaRpn(severity, occurrence, detection)!;
    const highPriority = body.is_high_priority === true;

    if (action === "ADD_MODE") {
      const order = current.modes.filter((mode) => mode.process_step_id === processStepId).length + 1;
      const base = { process_step_id: processStepId, is_high_priority: highPriority };
      const result = await insertCompatible(ctx.admin, "fmea_failure_modes", [
        { ...base, sequence_no: order, failure_mode: label, potential_effect: effect || null, potential_cause: cause || null, current_controls: control || null, severity_score: severity, occurrence_score: occurrence, detection_score: detection, rpn },
        { ...base, mode_no: order, failure_mode_description: label, potential_effect: effect || null, potential_cause: cause || null, current_controls: control || null, severity: severity, occurrence: occurrence, detection: detection, rpn },
        { ...base, sort_order: order, mode_name: label, effect: effect || null, cause: cause || null, current_control: control || null, severity, occurrence, detection, risk_priority_number: rpn },
        { ...base, sort_order: order, name: label, effects: effect || null, causes: cause || null, controls: control || null, s_score: severity, o_score: occurrence, d_score: detection, risk_score: rpn },
      ]);
      if (!result.data) return NextResponse.json({ error: result.error }, { status: 400 });
      const newValue = { process_step_id: processStepId, label, effect: effect || null, cause: cause || null, control: control || null, severity, occurrence, detection, rpn, is_high_priority: highPriority };
      const { error: logError } = await logChange({ table: "fmea_failure_modes", rowId: result.data.id, actionType: "FMEA_FAILURE_MODE_ADD", newValue });
      if (logError) { await ctx.admin.from("fmea_failure_modes").delete().eq("id", result.data.id); return NextResponse.json({ error: `Không ghi được audit trail; failure mode mới đã được hoàn tác. ${logError.message}` }, { status: 400 }); }
      return NextResponse.json({ ok: true, message: `Đã thêm failure mode. RPN = ${rpn}.` });
    }

    if (!modeId) return NextResponse.json({ error: "Thiếu failure mode cần sửa." }, { status: 400 });
    const raw = current.rawModes.find((row) => String(row.id) === modeId);
    if (!raw) return NextResponse.json({ error: "Không tìm thấy failure mode." }, { status: 404 });
    const patch = modePatch(raw, { processStepId, label, effect, cause, control, severity, occurrence, detection, rpn, highPriority });
    const oldValue = normalizeFmeaFailureMode(raw);
    const { error: updateError } = await ctx.admin.from("fmea_failure_modes").update(patch).eq("id", modeId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    const newValue = { ...oldValue, process_step_id: processStepId, label, effect: effect || null, cause: cause || null, control: control || null, severity, occurrence, detection, rpn, is_high_priority: highPriority };
    const { error: logError } = await logChange({ table: "fmea_failure_modes", rowId: modeId, actionType: "FMEA_FAILURE_MODE_UPDATE", oldValue, newValue, fallbackReason: "Điều chỉnh failure mode trong giai đoạn phân tích." });
    if (logError) { await ctx.admin.from("fmea_failure_modes").update(rollbackPatch(raw, patch)).eq("id", modeId); return NextResponse.json({ error: `Không ghi được audit trail; thay đổi đã được hoàn tác. ${logError.message}` }, { status: 400 }); }
    return NextResponse.json({ ok: true, message: `Đã cập nhật failure mode. RPN = ${rpn}.` });
  }

  return NextResponse.json({ error: "Thao tác thiết lập FMEA không hợp lệ." }, { status: 400 });
}
